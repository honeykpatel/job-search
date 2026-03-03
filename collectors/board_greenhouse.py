import requests


def _extract_slug(value: str) -> str:
    v = value.strip().rstrip("/")
    if not v:
        return ""
    if "greenhouse.io" in v:
        return v.split("/")[-1]
    return v


def search_greenhouse(board: str, job_title: str, k: int = 5):
    slug = _extract_slug(board)
    if not slug:
        return []

    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    jobs = r.json().get("jobs", [])

    q = job_title.lower().strip()
    out = []
    for j in jobs:
        title = (j.get("title") or "").strip()
        loc = (j.get("location", {}) or {}).get("name")
        text = title.lower()
        if q and q not in text:
            continue
        out.append(
            {
                "title": title,
                "company": None,
                "location": loc,
                "url": j.get("absolute_url"),
                "source": f"Greenhouse:{slug}",
                "description": j.get("content"),
                "search_query": job_title.strip(),
            }
        )
        if len(out) >= k:
            break
    return out
