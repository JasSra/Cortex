import os, sys, glob, json, sqlite3, shutil, time, re, math
from pathlib import Path
import tldextract
import pandas as pd
import requests
from urllib.parse import urlparse, unquote
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
    try:
        ext = tldextract.extract(url)
        return ".".join([p for p in [ext.domain, ext.suffix] if p])
    except Exception:
        return urlparse(url).netloc

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

def scan_storage(profile_dir: Path) -> pd.DataFrame:
    # modern storage under storage/default/<origin dirs>
    roots = []
    storage_root = profile_dir / "storage" / "default"
    if storage_root.exists():
        for origin in storage_root.glob("**/*"):
            if origin.is_dir():
                try:
                    mtime = pd.to_datetime(os.path.getmtime(origin), unit="s", utc=True).tz_convert("Australia/Brisbane")
                except Exception:
                    mtime = pd.NaT
                roots.append({"origin": origin.name, "last_modified": mtime})
    return pd.DataFrame(roots)

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
    centroid = topic_vectors.mean(axis=0)
    sims = cosine_similarity(X_hn, centroid)
    hn_df = hn_df.copy()
    hn_df["relevance"] = sims.ravel()
    # blend with HN score to avoid junk: alpha controls balance
    alpha = 0.7
    hn_df["rank_score"] = alpha*hn_df["relevance"] + (1-alpha)*(hn_df["score"] / (hn_df["score"].max() or 1))
    hn_df.sort_values(["rank_score","score"], ascending=False, inplace=True)
    return hn_df.head(top_k)

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

    # 5) Console summary
    print(f"Profile: {profile}")
    print(f"History rows (unique URLs): {len(hist)}")
    if topics:
        print("Top 5 topics:")
        for t in topics[:5]:
            print(f"- T{t['topic_id']}: {', '.join(t['keywords'][:8])}")
    if Path("hn_recommendations.csv").exists():
        print("Saved: history_unique.csv, storage_origins.csv, topics.json, hn_recommendations.csv")
    else:
        print("Saved: history_unique.csv, storage_origins.csv, topics.json")

if __name__ == "__main__":
    main()