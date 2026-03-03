import requests

REMOTIVE_API = "https://remotive.com/api/remote-jobs"


def search_remotive(job_title: str, k: int = 5):
    q = job_title.strip()
    r = requests.get(REMOTIVE_API, params={"search": q}, timeout=20)
    r.raise_for_status()
    data = r.json().get("jobs", [])[:k]

    out = []
    for j in data:
        out.append(
            {
                "title": j.get("title"),
                "company": j.get("company_name"),
                "location": j.get("candidate_required_location") or "Remote",
                "url": j.get("url"),
                "source": "Remotive",
                "description": j.get("description"),
                "job_type": j.get("job_type"),
                "salary_text": j.get("salary"),
                "search_query": q,
            }
        )
    return out
