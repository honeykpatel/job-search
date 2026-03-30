import os

import requests


ADZUNA_COUNTRY_ALIASES = {
    "au": "au",
    "australia": "au",
    "ca": "ca",
    "canada": "ca",
    "gb": "gb",
    "great britain": "gb",
    "uk": "gb",
    "united kingdom": "gb",
    "in": "in",
    "india": "in",
    "nz": "nz",
    "new zealand": "nz",
    "sg": "sg",
    "singapore": "sg",
    "us": "us",
    "usa": "us",
    "united states": "us",
}


def _infer_country(location: str) -> str:
    normalized = (location or "").strip().lower()
    if not normalized:
        return (os.getenv("ADZUNA_DEFAULT_COUNTRY") or "ca").strip().lower()

    for alias, code in ADZUNA_COUNTRY_ALIASES.items():
        if alias in normalized:
            return code

    return (os.getenv("ADZUNA_DEFAULT_COUNTRY") or "ca").strip().lower()


def _matches_work_style(job: dict, work_style: str) -> bool:
    mode = (work_style or "Any").strip().lower()
    if mode == "any":
        return True

    searchable_text = " ".join(
        [
            str(job.get("title") or ""),
            str(job.get("description") or ""),
            str(job.get("location", {}).get("display_name") or ""),
        ]
    ).lower()

    if mode == "remote":
        return "remote" in searchable_text
    if mode == "hybrid":
        return "hybrid" in searchable_text
    if mode == "onsite":
        return "onsite" in searchable_text or "on-site" in searchable_text or "in office" in searchable_text
    return True


def search_adzuna(job_title: str, location: str = "", work_style: str = "Any", k: int = 5):
    app_id = (os.getenv("ADZUNA_APP_ID") or "").strip()
    app_key = (os.getenv("ADZUNA_APP_KEY") or "").strip()
    if not app_id or not app_key:
        return []

    query = job_title.strip()
    country = _infer_country(location)
    endpoint = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": query,
        "results_per_page": max(1, min(k * 3, 50)),
        "content-type": "application/json",
    }
    if location.strip():
        params["where"] = location.strip()

    response = requests.get(endpoint, params=params, timeout=20)
    response.raise_for_status()
    results = response.json().get("results", [])

    out = []
    for job in results:
        if not _matches_work_style(job, work_style):
            continue

        salary_min = job.get("salary_min")
        salary_max = job.get("salary_max")
        salary_text = None
        if salary_min is not None and salary_max is not None:
            salary_text = f"{salary_min:.0f} - {salary_max:.0f}"

        out.append(
            {
                "title": job.get("title"),
                "company": (job.get("company") or {}).get("display_name"),
                "location": (job.get("location") or {}).get("display_name"),
                "url": job.get("redirect_url"),
                "source": f"Adzuna:{country}",
                "description": job.get("description"),
                "job_type": job.get("contract_time") or job.get("contract_type"),
                "salary_text": salary_text,
                "search_query": query,
            }
        )
        if len(out) >= k:
            break

    return out
