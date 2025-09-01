import os, sys, glob, json, sqlite3, shutil, time, re, math
from pathlib import Path
import numpy as np
import tldextract
import pandas as pd
import requests
from urllib.parse import urlparse, unquote, quote_plus
from bs4 import BeautifulSoup
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import NMF
from sklearn.metrics.pairwise import cosine_similarity

# ---------- helpers ----------
def find_profile_dir():
    candidates = []
    if sys.platform == "darwin":
        base = Path.home() / "Library/Application Support/Firefox/Profiles"
    elif sys.platform.startswith("linux"):
        base = Path.home() / ".mozilla/firefox"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", "")) / "Mozilla/Firefox/Profiles"
    else:
        raise RuntimeError("Unsupported OS")
    if not base.exists():
        raise FileNotFoundError(f"No Firefox profiles dir at {base}")
    for p in base.glob("*"):
        if p.is_dir():
            # prefer default-release or default
            if p.name.endswith((".default-release", ".default")):
                candidates.insert(0, p)
            else:
                candidates.append(p)
    if not candidates:
        raise FileNotFoundError("No profiles found.")
    return candidates[0]

def copy_db(src: Path) -> Path:
    dst = Path.cwd() / "places_copy.sqlite"
    if dst.exists():
        dst.unlink()
    shutil.copy2(src, dst)
    return dst

def clean_text(s: str) -> str:
    s = s or ""
    s = unquote(s)
    s = re.sub(r"https?://", " ", s)
    s = re.sub(r"[_\-/#.?&=:+%]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()

def extract_domain(url: str) -> str:
    """Return host or eTLD+1 for normal hosts, and raw IP for IP-based URLs."""
    host = None
    try:
        parsed = urlparse(url)
        host = parsed.hostname
    except Exception:
        host = None

    # If it's an IPv4 address, return as-is
    if host and re.match(r"^(?:\d{1,3}\.){3}\d{1,3}$", host):
        return host

    # Fall back to tldextract for domain names
    try:
        ext = tldextract.extract(url)
        if ext.suffix:
            return f"{ext.domain}.{ext.suffix}" if ext.domain else ext.suffix
        return ext.domain or (host or "")
    except Exception:
        return host or urlparse(url).netloc

def read_history(db_path: Path, limit: int | None = None) -> pd.DataFrame:
    con = sqlite3.connect(db_path)
    q = """
    SELECT p.url, p.title, p.last_visit_date
    FROM moz_places p
    WHERE p.url LIKE 'http%' AND p.visit_count > 0
    """
    if limit:
        q += f" LIMIT {int(limit)}"
    df = pd.read_sql_query(q, con)
    con.close()
    # last_visit_date is microseconds since epoch
    def to_ts(us):
        if pd.isna(us):
            return pd.NaT
        try:
            return pd.to_datetime(int(us), unit="us", utc=True).tz_convert("Australia/Brisbane")
        except Exception:
            return pd.NaT
    df["timestamp"] = df["last_visit_date"].apply(to_ts)
    df.drop(columns=["last_visit_date"], inplace=True)
    # dedupe by url keep latest
    df.sort_values("timestamp", ascending=False, inplace=True)
    df = df.drop_duplicates(subset=["url"], keep="first")
    df["domain"] = df["url"].map(extract_domain)
    return df

def _decode_firefox_origin_name(name: str) -> str:
    """Decode Firefox storage origin directory names like 'https+++example.com' to a readable origin.

    Notes:
    - Firefox encodes origins by replacing '://' with '+++' and other ':' with '+'; slashes are generally not present for origins.
    - Suffix metadata may be appended with '^', e.g. '^firstPartyDomain=…' — drop it.
    - We conservatively map remaining '+' to ':' to capture host:port if present.
    """
    base = name.split('^', 1)[0]
    if '+++' in base:
        scheme, rest = base.split('+++', 1)
        # Map '+' back to ':' to represent ports if present
        rest = rest.replace('+', ':')
        return f"{scheme}://{rest}"
    # moz-extension and others may also use '+++'
    return base.replace('+', ':')

def scan_storage(profile_dir: Path) -> pd.DataFrame:
    # Only consider top-level origin directories under storage/default/<origin>
    rows = []
    storage_root = profile_dir / "storage" / "default"
    if storage_root.exists():
        for origin_dir in storage_root.iterdir():
            if not origin_dir.is_dir():
                continue
            name = origin_dir.name
            # Filter to plausible origin directory names
            if '+++' not in name and not name.startswith(('moz-extension+++', 'file+++')):
                continue
            try:
                mtime = pd.to_datetime(os.path.getmtime(origin_dir), unit="s", utc=True).tz_convert("Australia/Brisbane")
            except Exception:
                mtime = pd.NaT
            rows.append({
                "origin": _decode_firefox_origin_name(name),
                "last_modified": mtime
            })
    return pd.DataFrame(rows)

def build_corpus(df: pd.DataFrame) -> list[str]:
    texts = []
    for _, r in df.iterrows():
        title = r.get("title") or ""
        urlbits = clean_text(r["url"])
        dom = r.get("domain") or ""
        texts.append(" ".join([clean_text(title), dom, urlbits]))
    return texts

def derive_topics(texts: list[str], n_topics: int = 10, n_words: int = 12):
    if not texts:
        return [], None, None
    vectorizer = TfidfVectorizer(max_df=0.8, min_df=2, ngram_range=(1,2), stop_words="english")
    X = vectorizer.fit_transform(texts)
    n_topics = min(n_topics, max(2, X.shape[0] // 50))  # scale down if tiny history
    model = NMF(n_components=n_topics, init="nndsvda", random_state=42, max_iter=400)
    W = model.fit_transform(X)
    H = model.components_
    terms = vectorizer.get_feature_names_out()
    topics = []
    for i, row in enumerate(H):
        top_idx = row.argsort()[-n_words:][::-1]
        topics.append({
            "topic_id": int(i),
            "keywords": [terms[j] for j in top_idx],
        })
    return topics, vectorizer, model

def fetch_hn_titles(n: int = 100):
    base = "https://hacker-news.firebaseio.com/v0"
    ids = requests.get(f"{base}/topstories.json", timeout=20).json()[:n]
    items = []
    for i in ids:
        try:
            it = requests.get(f"{base}/item/{i}.json", timeout=15).json()
            if it and it.get("title"):
                items.append({
                    "id": it.get("id"),
                    "title": it.get("title"),
                    "url": it.get("url"),
                    "by": it.get("by"),
                    "score": it.get("score", 0),
                    "time": pd.to_datetime(it.get("time", 0), unit="s", utc=True).tz_convert("Australia/Brisbane"),
                })
        except Exception:
            continue
    return pd.DataFrame(items)

def rank_hn(hn_df: pd.DataFrame, topics: list[dict], vectorizer, topic_model, top_k: int = 20):
    if hn_df.empty or not topics:
        return hn_df
    # Make "topic summary strings"
    topic_texts = [" ".join(t["keywords"]) for t in topics]
    # Vectorize HN titles
    X_hn = vectorizer.transform(hn_df["title"].map(clean_text))
    # Compose a "user interest centroid" by averaging topic word distributions
    topic_vectors = vectorizer.transform(topic_texts)
    # Ensure centroid is a numpy array (avoid np.matrix) for sklearn compatibility
    centroid = np.asarray(topic_vectors.mean(axis=0)).ravel().reshape(1, -1)
    sims = cosine_similarity(X_hn, centroid)
    hn_df = hn_df.copy()
    hn_df["relevance"] = sims.ravel()
    # blend with HN score to avoid junk: alpha controls balance
    alpha = 0.7
    hn_df["rank_score"] = alpha*hn_df["relevance"] + (1-alpha)*(hn_df["score"] / (hn_df["score"].max() or 1))
    hn_df.sort_values(["rank_score","score"], ascending=False, inplace=True)
    return hn_df.head(top_k)

# ---------- YouTube suggestions ----------
def _http_get(url: str, timeout: int = 20) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.text

def _parse_youtube_anchors(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    items = []
    seen = set()
    for a in soup.select("a#video-title"):
        title = a.get("title") or (a.text or "").strip()
        href = a.get("href") or ""
        if not title or not href:
            continue
        if not href.startswith("/watch?"):
            continue
        # Extract video id
        vid = None
        try:
            vid = dict([p.split("=",1) for p in href.split("?",1)[1].split("&")]).get("v")
        except Exception:
            vid = None
        if vid and vid in seen:
            continue
        seen.add(vid or href)
        url = f"https://www.youtube.com{href}"
        # Try to find channel near the anchor
        channel = None
        parent = a.find_parent()
        if parent is not None:
            ch = parent.select_one("a.yt-simple-endpoint.style-scope.yt-formatted-string")
            if ch and ch.text:
                channel = ch.text.strip()
        items.append({
            "title": title,
            "url": url,
            "channel": channel or "",
        })
    return items

def _extract_json_after(html: str, marker: str) -> dict | None:
    idx = html.find(marker)
    if idx == -1:
        return None
    # Find first '{' after marker
    start = html.find('{', idx)
    if start == -1:
        return None
    # Bracket matching to find the end of the JSON object
    depth = 0
    for i in range(start, len(html)):
        ch = html[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:i+1])
                except Exception:
                    return None
    return None

def _walk_video_renderers(obj) -> list[dict]:
    results = []
    if isinstance(obj, dict):
        if 'videoRenderer' in obj and isinstance(obj['videoRenderer'], dict):
            vr = obj['videoRenderer']
            title = (
                (vr.get('title') or {}).get('runs', [{}])[0].get('text')
                or ''
            )
            video_id = vr.get('videoId')
            url = f"https://www.youtube.com/watch?v={video_id}" if video_id else ''
            channel = ''
            byline = vr.get('longBylineText') or vr.get('ownerText') or {}
            runs = byline.get('runs') or []
            if runs:
                channel = runs[0].get('text', '')
            if title and url:
                results.append({
                    'title': title,
                    'url': url,
                    'channel': channel,
                })
        for v in obj.values():
            results.extend(_walk_video_renderers(v))
    elif isinstance(obj, list):
        for v in obj:
            results.extend(_walk_video_renderers(v))
    return results

def _parse_youtube_initialdata(html: str) -> list[dict]:
    data = (
        _extract_json_after(html, 'var ytInitialData =')
        or _extract_json_after(html, 'window["ytInitialData"] =')
        or _extract_json_after(html, 'ytInitialData =')
    )
    if not data:
        return []
    return _walk_video_renderers(data)

def fetch_youtube_candidates(topics: list[dict], max_topics: int = 8, per_topic: int = 20) -> pd.DataFrame:
    """Fetch YouTube candidates using Trending and topic-driven searches (no API key)."""
    all_items: list[dict] = []
    # 1) Trending (best-effort)
    try:
        html = _http_get("https://www.youtube.com/feed/trending", timeout=25)
        items = _parse_youtube_initialdata(html)
        if not items:
            items = _parse_youtube_anchors(html)
        all_items.extend(items)
    except Exception:
        pass
    # 2) Topic search queries
    for t in (topics or [])[:max_topics]:
        q_terms = (t.get("keywords") or [])[:4]
        if not q_terms:
            continue
        q = "+".join(q_terms)
        url = f"https://www.youtube.com/results?search_query={quote_plus(q)}"
        try:
            html = _http_get(url, timeout=25)
            items = _parse_youtube_initialdata(html)
            if not items:
                items = _parse_youtube_anchors(html)
            all_items.extend(items)
        except Exception:
            continue
        if len(all_items) > max(50, per_topic * max_topics):
            break
    if not all_items:
        return pd.DataFrame(columns=["title","url","channel"])  # empty
    # Dedupe by url
    dedup = {it["url"]: it for it in all_items}
    return pd.DataFrame(list(dedup.values()))

def rank_youtube(yt_df: pd.DataFrame, topics: list[dict], vectorizer, top_k: int = 30) -> pd.DataFrame:
    if yt_df.empty or not topics or vectorizer is None:
        return yt_df
    topic_texts = [" ".join(t.get("keywords") or []) for t in topics]
    topic_vectors = vectorizer.transform(topic_texts)
    centroid = np.asarray(topic_vectors.mean(axis=0)).ravel().reshape(1, -1)
    X_titles = vectorizer.transform(yt_df["title"].map(clean_text))
    sims = cosine_similarity(X_titles, centroid).ravel()
    yt_df = yt_df.copy()
    yt_df["relevance"] = sims
    yt_df.sort_values(["relevance","title"], ascending=[False, True], inplace=True)
    return yt_df.head(top_k)

def main():
    profile = find_profile_dir()
    places = profile / "places.sqlite"
    if not places.exists():
        raise FileNotFoundError(f"{places} not found")
    copy = copy_db(places)

    # 1) History
    hist = read_history(copy)
    hist.to_csv("history_unique.csv", index=False)

    # 2) Storage origins (metadata only)
    storage_df = scan_storage(profile)
    storage_df.to_csv("storage_origins.csv", index=False)

    # 3) Topics
    corpus = build_corpus(hist)
    topics, vectorizer, model = derive_topics(corpus, n_topics=12, n_words=12)
    with open("topics.json","w") as f:
        json.dump({"topics": topics}, f, indent=2)

    # 4) HN fetch + suggestions
    try:
        hn = fetch_hn_titles(n=150)
        ranked = rank_hn(hn, topics, vectorizer, model, top_k=25)
        ranked.to_csv("hn_recommendations.csv", index=False)
    except Exception as e:
        print(f"HN fetch/rank skipped: {e}")

    # 4b) YouTube suggestions
    try:
        yt_candidates = fetch_youtube_candidates(topics, max_topics=8, per_topic=20)
        yt_ranked = rank_youtube(yt_candidates, topics, vectorizer, top_k=30)
        if not yt_ranked.empty:
            yt_ranked.to_csv("youtube_recommendations.csv", index=False)
    except Exception as e:
        print(f"YouTube fetch/rank skipped: {e}")

    # 5) Console summary
    print(f"Profile: {profile}")
    print(f"History rows (unique URLs): {len(hist)}")
    if topics:
        print("Top 5 topics:")
        for t in topics[:5]:
            print(f"- T{t['topic_id']}: {', '.join(t['keywords'][:8])}")
    saved = ["history_unique.csv", "storage_origins.csv", "topics.json"]
    if Path("hn_recommendations.csv").exists():
        saved.append("hn_recommendations.csv")
    if Path("youtube_recommendations.csv").exists():
        saved.append("youtube_recommendations.csv")
    print("Saved: " + ", ".join(saved))

if __name__ == "__main__":
    main()