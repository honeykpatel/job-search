import os

import requests

USAJOBS_API = "https://data.usajobs.gov/api/search"


def _build_salary_text(remuneration_items: list[dict]) -> str | None:
    parts = []
    for item in remuneration_items:
        minimum = str(item.get("MinimumRange") or "").strip()
        maximum = str(item.get("MaximumRange") or "").strip()
        description = str(item.get("Description") or "").strip()
        if minimum and maximum:
            parts.append(f"${minimum} - ${maximum}{f' {description}' if description else ''}")
    return " | ".join(parts) if parts else None


def _build_description(descriptor: dict) -> str | None:
    details = ((descriptor.get("UserArea") or {}).get("Details") or {})
    description_parts = [
        str(descriptor.get("QualificationSummary") or "").strip(),
        str(details.get("MajorDuties") or "").strip(),
        str(details.get("Requirements") or "").strip(),
    ]
    description = "\n\n".join(part for part in description_parts if part)
    return description or None


def search_usajobs(job_title: str, location: str = "", k: int = 5):
    query = job_title.strip()
    api_key = (os.getenv("USAJOBS_API_KEY") or "").strip()
    user_email = (os.getenv("USAJOBS_USER_EMAIL") or "").strip()
    if not api_key or not user_email:
        return []

    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": user_email,
        "Authorization-Key": api_key,
    }
    params = {
        "PositionTitle": query,
        "ResultsPerPage": min(max(k * 2, 10), 100),
        "Page": 1,
        "WhoMayApply": "public",
        "SortField": "openingdate",
        "SortDirection": "desc",
        "Fields": "all",
    }
    if location.strip():
        params["LocationName"] = location.strip()

    response = requests.get(USAJOBS_API, headers=headers, params=params, timeout=20)
    response.raise_for_status()
    items = ((response.json().get("SearchResult") or {}).get("SearchResultItems") or [])

    out = []
    for item in items:
        descriptor = item.get("MatchedObjectDescriptor") or {}
        schedules = [
            str(schedule.get("Name") or "").strip()
            for schedule in (descriptor.get("PositionSchedule") or [])
            if isinstance(schedule, dict) and str(schedule.get("Name") or "").strip()
        ]
        out.append(
            {
                "title": descriptor.get("PositionTitle"),
                "company": descriptor.get("OrganizationName"),
                "location": descriptor.get("PositionLocationDisplay"),
                "url": descriptor.get("PositionURI") or (descriptor.get("ApplyURI") or [None])[0],
                "source": "USAJOBS",
                "description": _build_description(descriptor),
                "job_type": " | ".join(schedules) if schedules else None,
                "salary_text": _build_salary_text(descriptor.get("PositionRemuneration") or []),
                "search_query": query,
            }
        )
        if len(out) >= k:
            break

    return out
