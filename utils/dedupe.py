def dedupe_jobs(jobs: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for j in jobs:
        url = (j.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(j)
    return out