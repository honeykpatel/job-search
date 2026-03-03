import requests


def _extract_slug(value: str) -> str:
    v = value.strip().rstrip("/")
    if not v:
        return ""
    if "ashbyhq.com" in v:
        return v.split("/")[-1]
    return v


def search_ashby(board: str, job_title: str, k: int = 5):
    slug = _extract_slug(board)
    if not slug:
        return []

    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    jobs = r.json().get("jobs", [])

    q = job_title.lower().strip()
    out = []
    for j in jobs:
        title = (j.get("title") or "").strip()
        loc = j.get("location")
        if isinstance(loc, dict):
            loc = loc.get("name")
        text = title.lower()
        if q and q not in text:
            continue
        out.append(
            {
                "title": title,
                "company": j.get("companyName"),
                "location": loc,
                "url": j.get("jobUrl"),
                "source": f"Ashby:{slug}",
                "description": (
                    j.get("descriptionPlain")
                    or j.get("description")
                    or j.get("descriptionHtml")
                ),
                "search_query": job_title.strip(),
            }
        )
        if len(out) >= k:
            break
    return out
