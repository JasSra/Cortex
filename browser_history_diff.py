#!/usr/bin/env python3
# browser_history_diff.py
# Collects visit history diffs from Firefox, Chrome, Edge, Safari.
# First run: full scan. Later runs: only new visits since last timestamp per browser.
# Saves CSVs, summary.json, optional dev JSON dumps, zips outputs, optional POST to API.

import os, sys, sqlite3, shutil, json, csv, zipfile, tempfile, platform
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import requests

# ---------- Config ----------
OUTDIR = Path("out"); OUTDIR.mkdir(exist_ok=True)
STATE_PATH = Path.home() / ".browser_collect_state.json"
API_URL = os.environ.get("API_URL")  # optional: set to POST the zip
DEV_JSON = (os.environ.get("DEV_JSON", "0") == "1")  # or use --dev

# ---------- Time helpers ----------
EPOCH_1601 = datetime(1601, 1, 1, tzinfo=timezone.utc)   # Chromium
EPOCH_2001 = datetime(2001, 1, 1, tzinfo=timezone.utc)   # Safari

def chrome_time_to_unix_s(micro_since_1601: int) -> float:
    try:
        return (EPOCH_1601 + timedelta(microseconds=int(micro_since_1601))).timestamp()
    except Exception:
        return 0.0

def safari_time_to_unix_s(sec_since_2001: float) -> float:
    try:
        return (EPOCH_2001 + timedelta(seconds=float(sec_since_2001))).timestamp()
    except Exception:
        return 0.0

def firefox_time_to_unix_s(micro_since_1970: int) -> float:
    try:
        return datetime.fromtimestamp(int(micro_since_1970)/1_000_000, tz=timezone.utc).timestamp()
    except Exception:
        return 0.0

# ---------- State ----------
def load_state() -> Dict[str, float]:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            sys.stderr.write(f"[warn] cannot parse state file {STATE_PATH}, starting fresh\n")
            return {}
    return {}

def save_state(state: Dict[str, float]) -> None:
    try:
        STATE_PATH.write_text(json.dumps(state, indent=2))
    except Exception as e:
        sys.stderr.write(f"[warn] cannot save state {STATE_PATH}: {e}\n")

# ---------- Safe copy (avoid locks / permissions) ----------
def safe_copy(src: Path) -> Optional[Path]:
    """Copy DB to temp. Return None if cannot copy (permissions/locks)."""
    try:
        tmp = Path(tempfile.mkdtemp())
        dst = tmp / src.name
        shutil.copy2(src, dst)
        return dst
    except Exception as e:
        sys.stderr.write(f"[skip] cannot copy {src}: {e}\n")
        return None

# ---------- CSV writer ----------
def write_csv_append(rows: List[Dict[str, Any]], out_csv: Path) -> int:
    """Append deduped rows based on (url, ts_unix, profile). Returns #new rows written."""
    headers = ["url", "title", "ts_unix", "browser", "profile"]
    existing = set()
    if out_csv.exists():
        try:
            with out_csv.open("r", encoding="utf-8") as f:
                r = csv.DictReader(f)
                for rr in r:
                    existing.add((rr.get("url",""), rr.get("ts_unix",""), rr.get("profile","")))
        except Exception as e:
            sys.stderr.write(f"[warn] cannot read existing CSV {out_csv}: {e}\n")
    new_written = 0
    try:
        with out_csv.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=headers)
            if f.tell() == 0:
                w.writeheader()
            for r in rows:
                key = (r.get("url",""), str(r.get("ts_unix","")), r.get("profile",""))
                if key in existing:
                    continue
                w.writerow({
                    "url": r.get("url",""),
                    "title": r.get("title",""),
                    "ts_unix": r.get("ts_unix",0),
                    "browser": r.get("browser",""),
                    "profile": r.get("profile",""),
                })
                new_written += 1
    except Exception as e:
        sys.stderr.write(f"[warn] cannot write CSV {out_csv}: {e}\n")
    return new_written

# ---------- Collectors ----------
def collect_firefox(state: Dict[str, float]):
    key = "firefox"
    last = state.get(key, 0.0)
    results: List[Dict[str, Any]] = []

    if sys.platform == "darwin":
        base = Path.home() / "Library/Application Support/Firefox/Profiles"
    elif sys.platform.startswith("linux"):
        base = Path.home() / ".mozilla/firefox"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA","")) / "Mozilla/Firefox/Profiles"
    else:
        return key, results, last

    if not base.exists():
        return key, results, last

    for prof in base.glob("*"):
        db = prof / "places.sqlite"
        if not db.exists():
            continue
        cp = safe_copy(db)
        if cp is None:
            continue
        try:
            con = sqlite3.connect(cp)
        except Exception as e:
            sys.stderr.write(f"[skip] cannot open sqlite {cp}: {e}\n")
            continue
        cur = con.cursor()
        q = """
        SELECT p.url, p.title, v.visit_date
        FROM moz_historyvisits v
        JOIN moz_places p ON p.id = v.place_id
        WHERE p.url LIKE 'http%' AND v.visit_date > ?
        """
        param = int(last*1_000_000)
        try:
            for url, title, vdate in cur.execute(q, (param,)):
                ts = firefox_time_to_unix_s(vdate or 0)
                if ts <= 0:
                    continue
                results.append({
                    "browser": key,
                    "profile": prof.name,
                    "url": url or "",
                    "title": title or "",
                    "ts_unix": round(ts, 3),
                })
        except Exception as e:
            sys.stderr.write(f"[skip] query error (firefox {prof.name}): {e}\n")
        finally:
            con.close()

    if results:
        state[key] = max(last, max(r["ts_unix"] for r in results))
    return key, results, last

def _collect_chromium_family(state: Dict[str, float], family_key: str, profile_globs: List[Path]):
    last = state.get(family_key, 0.0)
    results: List[Dict[str, Any]] = []
    for g in profile_globs:
        if not g.parent.exists() and not g.exists():
            continue
        for hist_path in g.glob("History"):
            cp = safe_copy(hist_path)
            if cp is None:
                continue
            try:
                con = sqlite3.connect(cp)
            except Exception as e:
                sys.stderr.write(f"[skip] cannot open sqlite {cp}: {e}\n")
                continue
            cur = con.cursor()
            q = """
            SELECT urls.url, urls.title, visits.visit_time
            FROM visits
            JOIN urls ON urls.id = visits.url
            WHERE urls.url LIKE 'http%' AND visits.visit_time > ?
            """
            param = int((last - EPOCH_1601.timestamp())*1_000_000) if last>0 else 0
            try:
                for url, title, vtime in cur.execute(q, (param,)):
                    ts = chrome_time_to_unix_s(vtime or 0)
                    if ts <= 0:
                        continue
                    results.append({
                        "browser": family_key,
                        "profile": hist_path.parent.name,
                        "url": url or "",
                        "title": title or "",
                        "ts_unix": round(ts, 3),
                    })
            except Exception as e:
                sys.stderr.write(f"[skip] query error ({family_key} {hist_path.parent.name}): {e}\n")
            finally:
                con.close()
    if results:
        state[family_key] = max(last, max(r["ts_unix"] for r in results))
    return family_key, results, last

def collect_chrome(state: Dict[str, float]):
    if sys.platform == "darwin":
        globs = [Path.home()/ "Library/Application Support/Google/Chrome" / "*" ]
    elif sys.platform.startswith("linux"):
        globs = [Path.home()/ ".config/google-chrome" / "*", Path.home()/ ".config/chromium" / "*" ]
    elif sys.platform.startswith("win"):
        globs = [Path(os.environ.get("LOCALAPPDATA",""))/ "Google/Chrome/User Data" / "*" ]
    else:
        globs = []
    return _collect_chromium_family(state, "chrome", globs)

def collect_edge(state: Dict[str, float]):
    if sys.platform == "darwin":
        globs = [Path.home()/ "Library/Application Support/Microsoft Edge" / "*" ]
    elif sys.platform.startswith("linux"):
        globs = [Path.home()/ ".config/microsoft-edge" / "*" ]
    elif sys.platform.startswith("win"):
        globs = [Path(os.environ.get("LOCALAPPDATA",""))/ "Microsoft/Edge/User Data" / "*" ]
    else:
        globs = []
    return _collect_chromium_family(state, "edge", globs)

def collect_safari(state: Dict[str, float]):
    key = "safari"
    last = state.get(key, 0.0)
    results: List[Dict[str, Any]] = []
    if sys.platform != "darwin":
        return key, results, last
    db = Path.home() / "Library/Safari/History.db"
    if not db.exists():
        return key, results, last
    cp = safe_copy(db)
    if cp is None:
        return key, results, last
    try:
        con = sqlite3.connect(cp)
    except Exception as e:
        sys.stderr.write(f"[skip] cannot open sqlite {cp}: {e}\n")
        return key, results, last
    cur = con.cursor()
    q = """
    SELECT hi.url, hi.title, hv.visit_time
    FROM history_visits hv
    JOIN history_items hi ON hi.id = hv.history_item
    WHERE hi.url LIKE 'http%' AND hv.visit_time > ?
    """
    param = (last - EPOCH_2001.timestamp()) if last>0 else 0
    try:
        for url, title, vsec in cur.execute(q, (param,)):
            ts = safari_time_to_unix_s(vsec or 0)
            if ts <= 0:
                continue
            results.append({
                "browser": key,
                "profile": "default",
                "url": url or "",
                "title": title or "",
                "ts_unix": round(ts, 3),
            })
    except Exception as e:
        sys.stderr.write(f"[skip] query error (safari): {e}\n")
    finally:
        con.close()
    if results:
        state[key] = max(last, max(r["ts_unix"] for r in results))
    return key, results, last

# ---------- Bundle + POST ----------
def zip_outputs(zip_path: Path, files: List[Path]) -> None:
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for f in files:
                if f.exists():
                    z.write(f, arcname=f.name)
    except Exception as e:
        sys.stderr.write(f"[warn] cannot create zip {zip_path}: {e}\n")

def maybe_post(zip_path: Path, summary: Dict[str, Any]) -> Dict[str, Any]:
    if not API_URL:
        return {"posted": False, "status": "API_URL not set"}
    try:
        with zip_path.open("rb") as fh:
            resp = requests.post(
                API_URL,
                files={"archive": ("history_bundle.zip", fh, "application/zip")},
                data={"meta": json.dumps(summary)},
                timeout=60,
            )
        return {"posted": True, "status": f"{resp.status_code}", "response_snippet": resp.text[:200]}
    except Exception as e:
        return {"posted": False, "status": f"error: {e}"}

# ---------- Main ----------
def main():
    global DEV_JSON
    if "--dev" in sys.argv:
        DEV_JSON = True

    os_name = platform.system()
    state = load_state()
    all_rows: List[Dict[str, Any]] = []
    devdir = OUTDIR / "dev"
    if DEV_JSON:
        try:
            devdir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            sys.stderr.write(f"[warn] cannot create dev dir {devdir}: {e}\n")

    collectors = [collect_firefox, collect_chrome, collect_edge, collect_safari]
    summaries = []

    for fn in collectors:
        try:
            name, rows, prev = fn(state)
        except Exception as e:
            # last resort guard so one collector never kills the run
            sys.stderr.write(f"[skip] collector crashed ({fn.__name__}): {e}\n")
            name, rows, prev = fn.__name__.replace("collect_", ""), [], state.get(fn.__name__, 0.0)

        out_csv = OUTDIR / f"history_{name}.csv"
        new_written = write_csv_append(rows, out_csv)
        summaries.append({"browser": name, "new_rows": int(new_written), "prev_last_ts": prev, "new_last_ts": state.get(name, prev)})
        all_rows.extend(rows)

        # dev JSON: per-browser diff (exact rows found this run)
        if DEV_JSON:
            try:
                (devdir / f"{name}_diff.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))
            except Exception as e:
                sys.stderr.write(f"[warn] cannot write dev json for {name}: {e}\n")

    save_state(state)

    summary = {
        "os": os_name,
        "run_utc": datetime.utcnow().isoformat() + "Z",
        "total_new": len(all_rows),
        "per_browser": summaries,
        "state_file": str(STATE_PATH),
    }
    try:
        (OUTDIR / "summary.json").write_text(json.dumps(summary, indent=2))
    except Exception as e:
        sys.stderr.write(f"[warn] cannot write summary.json: {e}\n")

    # dev JSON: all + summary
    if DEV_JSON:
        try:
            (devdir / "all_findings.json").write_text(json.dumps(all_rows, ensure_ascii=False, indent=2))
            (devdir / "summary.dev.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
        except Exception as e:
            sys.stderr.write(f"[warn] cannot write dev bundle: {e}\n")

    # zip + POST
    zip_path = OUTDIR / "history_bundle.zip"
    files = [OUTDIR / f"history_{k}.csv" for k in ["firefox","chrome","edge","safari"]] + [OUTDIR / "summary.json"]
    zip_outputs(zip_path, files)
    post_info = maybe_post(zip_path, summary)

    print(json.dumps({"summary": summary, "zip": str(zip_path), "post": post_info}, indent=2))

if __name__ == "__main__":
    main()