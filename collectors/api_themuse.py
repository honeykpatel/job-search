import os

import requests

THEMUSE_API = "https://www.themuse.com/api/public/jobs"


def _matches_query(job: dict, query: str) -> bool:
    if not query:
        return True

    title = str(job.get("name") or "").lower()
    companies = job.get("company") or []
    if isinstance(companies, dict):
        companies = [companies]
    company_names = " ".join(
        str(company.get("name") or "")
        for company in companies
        if isinstance(company, dict)
    ).lower()
    location_names = " ".join(
        str(location.get("name") or "")
        for location in (job.get("locations") or [])
        if isinstance(location, dict)
    ).lower()
    return query in f"{title} {company_names} {location_names}"


def search_themuse(job_title: str, k: int = 5):
    query = job_title.strip()
    api_key = (os.getenv("THE_MUSE_API_KEY") or "").strip()

    params = {"page": 0, "descending": "true"}
    if api_key:
        params["api_key"] = api_key

    out = []
    seen_urls = set()
    max_pages = 3

    for page in range(max_pages):
        params["page"] = page
        response = requests.get(THEMUSE_API, params=params, timeout=20)
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", [])
        if not results:
            break

        for job in results:
            if not _matches_query(job, query.lower()):
                continue

            refs = job.get("refs") or {}
            landing_page = refs.get("landing_page")
            if not landing_page or landing_page in seen_urls:
                continue
            seen_urls.add(landing_page)

            company = None
            companies = job.get("company") or []
            if isinstance(companies, dict):
                companies = [companies]
            if companies and isinstance(companies[0], dict):
                company = companies[0].get("name")

            locations = [
                str(location.get("name") or "").strip()
                for location in (job.get("locations") or [])
                if isinstance(location, dict) and str(location.get("name") or "").strip()
            ]
            levels = [
                str(level.get("name") or "").strip()
                for level in (job.get("levels") or [])
                if isinstance(level, dict) and str(level.get("name") or "").strip()
            ]
            categories = [
                str(category.get("name") or "").strip()
                for category in (job.get("categories") or [])
                if isinstance(category, dict) and str(category.get("name") or "").strip()
            ]

            out.append(
                {
                    "title": job.get("name"),
                    "company": company,
                    "location": " | ".join(locations) if locations else None,
                    "url": landing_page,
                    "source": "The Muse",
                    "description": job.get("contents"),
                    "job_type": " | ".join(levels) if levels else None,
                    "salary_text": " | ".join(categories) if categories else None,
                    "search_query": query,
                }
            )
            if len(out) >= k:
                return out

        if page + 1 >= int(payload.get("page_count") or 0):
            break

    return out
