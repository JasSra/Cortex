#!/usr/bin/env python3
# yt_rss_diff.py
# Input: text file with one YouTube RSS/Atom URL per line.
# First run: fetch ALL items per feed → consolidated JSON → (optional) POST → save last video id per feed.
# Next runs: fetch DIFF (new items since last id) → consolidated JSON → (optional) POST → update state.
# Robust error handling, concurrent fetch, preview URLs, channel meta.

import os, sys, json, time, concurrent.futures, traceback
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
import requests, feedparser

# -------- Config --------
STATE_PATH = Path.home() / ".yt_feed_state.json"
OUTDIR = Path("out"); OUTDIR.mkdir(exist_ok=True)
API_URL = os.environ.get("API_URL")           # optional: POST JSON here
WORKERS = int(os.environ.get("WORKERS", "8")) # tweak concurrency
UA = "yt-rss-collector/1.0 (+https://{{ PLACEHOLDER }})"
REQ_TIMEOUT = 20

# -------- State I/O --------
def load_state():
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception as e:
            sys.stderr.write(f"[warn] cannot parse state {STATE_PATH}: {e}\n")
    return {}

def save_state(state):
    try:
        STATE_PATH.write_text(json.dumps(state, indent=2))
    except Exception as e:
        sys.stderr.write(f"[warn] cannot save state: {e}\n")

# -------- Helpers --------
def iso_now():
    return datetime.now(timezone.utc).isoformat()

def parse_video_id(entry):
    # Prefer yt:videoId if present
    vid = entry.get("yt_videoid") or entry.get("yt_videoId")
    if vid: return vid
    # Fallback: parse from link
    link = entry.get("link") or ""
    try:
        u = urlparse(link)
        qs = parse_qs(u.query)
        if "v" in qs and qs["v"]:
            return qs["v"][0]
        # shorts path /shorts/{id}
        parts = [p for p in u.path.split("/") if p]
        if len(parts) >= 2 and parts[0].lower() == "shorts":
            return parts[1]
        # /embed/{id}
        if len(parts) >= 2 and parts[0].lower() == "embed":
            return parts[1]
    except Exception:
        pass
    # Last resort: entry.id tail
    eid = entry.get("id") or ""
    if eid.rfind(":") != -1:
        return eid.split(":")[-1]
    return eid[-11:] if len(eid) >= 11 else eid

def to_preview_urls(video_id: str):
    if not video_id:
        return {}
    return {
        "watch": f"https://www.youtube.com/watch?v={video_id}",
        "embed": f"https://www.youtube.com/embed/{video_id}",
        "short": f"https://youtu.be/{video_id}",
        "thumb_hq": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "thumb_maxres": f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
    }

def fetch_feed(feed_url: str, etag: str | None, last_modified: str | None):
    headers = {"User-Agent": UA}
    if etag: headers["If-None-Match"] = etag
    if last_modified: headers["If-Modified-Since"] = last_modified
    try:
        r = requests.get(feed_url, headers=headers, timeout=REQ_TIMEOUT)
        if r.status_code == 304:
            return {"status": 304, "etag": etag, "last_modified": last_modified, "entries": [], "feed": {}}
        if r.status_code >= 400:
            sys.stderr.write(f"[skip] HTTP {r.status_code} {feed_url}\n")
            return {"status": r.status_code, "etag": None, "last_modified": None, "entries": [], "feed": {}}
        parsed = feedparser.parse(r.content)
        return {
            "status": 200,
            "etag": r.headers.get("ETag") or etag,
            "last_modified": r.headers.get("Last-Modified") or last_modified,
            "entries": parsed.entries or [],
            "feed": getattr(parsed, "feed", {}) or {},
        }
    except Exception as e:
        sys.stderr.write(f"[skip] fetch error {feed_url}: {e}\n")
        return {"status": -1, "etag": etag, "last_modified": last_modified, "entries": [], "feed": {}}

def entry_time_iso(entry):
    # Prefer 'published' string, else 'updated', else None
    if "published" in entry and entry["published"]:
        return entry["published"]
    if "updated" in entry and entry["updated"]:
        return entry["updated"]
    # Try parsed
    try:
        if entry.get("published_parsed"):
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", entry["published_parsed"])
        if entry.get("updated_parsed"):
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", entry["updated_parsed"])
    except Exception:
        pass
    return None

def normalize_items(feed_url: str, meta_feed: dict, entries: list[dict], last_seen_id: str | None):
    channel_title = meta_feed.get("title") or meta_feed.get("yt_channel_title") or ""
    channel_id = meta_feed.get("yt_channelid") or meta_feed.get("channel_id") or ""

    # YouTube feeds are newest-first; diff = stop when hit last_seen_id
    new_items = []
    first_entry_vid = None
    for i, e in enumerate(entries):
        vid = parse_video_id(e)
        if i == 0:
            first_entry_vid = vid
        if last_seen_id and vid == last_seen_id:
            break  # reached known item; everything before this is new
        title = e.get("title") or ""
        link = e.get("link") or (f"https://www.youtube.com/watch?v={vid}" if vid else "")
        author = e.get("author") or (meta_feed.get("author", {}) or {}).get("name") or ""
        # thumbnails (media:thumbnail list)
        thumb = None
        try:
            thumbs = e.get("media_thumbnail") or e.get("media_thumbnail", [])
            if thumbs and isinstance(thumbs, list):
                thumb = thumbs[0].get("url")
        except Exception:
            thumb = None

        previews = to_preview_urls(vid)
        if not thumb and "thumb_hq" in previews:
            thumb = previews["thumb_hq"]

        new_items.append({
            "feed_url": feed_url,
            "channel_title": channel_title,
            "channel_id": channel_id,
            "video_id": vid,
            "title": title,
            "link": link,
            "author": author,
            "published": entry_time_iso(e),
            "updated": e.get("updated"),
            "previews": previews,
            "thumbnail": thumb,
        })
    return new_items, first_entry_vid, channel_title, channel_id

def process_one(feed_url: str, prev: dict):
    try:
        prev_info = prev.get(feed_url, {})
        last_id = prev_info.get("last_video_id")
        etag = prev_info.get("etag")
        last_mod = prev_info.get("last_modified")

        fetched = fetch_feed(feed_url, etag, last_mod)
        if fetched["status"] == 304:
            return {
                "feed_url": feed_url, "new_count": 0, "channel_title": "", "channel_id": "",
                "last_seen_before": last_id, "last_seen_after": last_id, "items": [], "status": 304
            }

        items, first_vid, ch_title, ch_id = normalize_items(feed_url, fetched["feed"], fetched["entries"], last_id)
        # Update state info for this feed
        new_state = {
            "last_video_id": first_vid or last_id,
            "etag": fetched["etag"],
            "last_modified": fetched["last_modified"],
            "channel_title": ch_title,
            "channel_id": ch_id,
            "last_checked": iso_now(),
        }
        return {
            "feed_url": feed_url,
            "new_count": len(items),
            "channel_title": ch_title,
            "channel_id": ch_id,
            "last_seen_before": last_id,
            "last_seen_after": new_state["last_video_id"],
            "items": items,
            "status": fetched["status"],
            "state_patch": new_state
        }
    except Exception as e:
        sys.stderr.write(f"[skip] process error {feed_url}: {e}\n")
        return {
            "feed_url": feed_url, "new_count": 0, "channel_title": "", "channel_id": "",
            "last_seen_before": prev.get(feed_url, {}).get("last_video_id"),
            "last_seen_after": prev.get(feed_url, {}).get("last_video_id"),
            "items": [], "status": -1
        }

def read_feed_list(txt_path: Path) -> list[str]:
    urls = []
    for line in txt_path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        urls.append(s)
    return urls

def post_json(payload: dict):
    if not API_URL:
        return {"posted": False, "status": "API_URL not set"}
    try:
        r = requests.post(API_URL, json=payload, timeout=60)
        return {"posted": True, "status": str(r.status_code), "response_snippet": (r.text or "")[:200]}
    except Exception as e:
        return {"posted": False, "status": f"error: {e}"}

def main():
    if len(sys.argv) < 2:
        print("Usage: python yt_rss_diff.py <feeds.txt> [out_dir]")
        sys.exit(1)
    txt = Path(sys.argv[1])
    outdir = OUTDIR if len(sys.argv) < 3 else Path(sys.argv[2]); outdir.mkdir(parents=True, exist_ok=True)

    state = load_state()
    feeds = read_feed_list(txt)
    if not feeds:
        sys.stderr.write("[warn] no feeds provided\n")

    max_workers = max(2, WORKERS)
    results = []
    # Concurrent fetch + parse
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = [ex.submit(process_one, u, state) for u in feeds]
        for f in concurrent.futures.as_completed(futs):
            try:
                results.append(f.result())
            except Exception as e:
                sys.stderr.write(f"[skip] worker crash: {e}\n")

    # Merge new items + update state
    all_items = []
    per_feed = []
    for r in results:
        all_items.extend(r.get("items", []))
        per_feed.append({
            "feed_url": r.get("feed_url"),
            "channel_title": r.get("channel_title"),
            "channel_id": r.get("channel_id"),
            "new_count": r.get("new_count", 0),
            "status": r.get("status"),
            "last_seen_before": r.get("last_seen_before"),
            "last_seen_after": r.get("last_seen_after"),
        })
        if "state_patch" in r and isinstance(r["state_patch"], dict):
            state[r["feed_url"]] = r["state_patch"]

    # Sort consolidated items by published desc (fallback to none-last)
    def sort_key(it):
        return it.get("published") or ""
    all_items.sort(key=sort_key, reverse=True)

    # Mode hint
    first_run = not STATE_PATH.exists()
    mode = "full" if first_run else "diff"

    payload = {
        "mode": mode,
        "run_utc": iso_now(),
        "source_list": str(txt),
        "total_new": len(all_items),
        "per_feed": per_feed,
        "items": all_items
    }

    # Save artifacts
    out_json = outdir / ("yt_full.json" if first_run else "yt_diff.json")
    (outdir / "yt_summary.json").write_text(json.dumps({
        "mode": mode, "run_utc": payload["run_utc"],
        "total_new": payload["total_new"], "feeds": per_feed,
        "state_file": str(STATE_PATH)
    }, indent=2))
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    save_state(state)

    # Optional POST
    post_info = post_json(payload)

    # Console summary (machine-readable)
    print(json.dumps({
        "mode": mode,
        "run_utc": payload["run_utc"],
        "feeds_processed": len(per_feed),
        "total_new": payload["total_new"],
        "json_path": str(out_json),
        "post": post_info
    }, indent=2))

if __name__ == "__main__":
    main()