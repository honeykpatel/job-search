from __future__ import annotations

from collections import Counter
import os
from typing import Any

from langchain_core.tools import tool
from tavily import TavilyClient

from matching.tfidf_ranker import rank_jobs
from storage.db import (
    get_application_by_job,
    get_job,
    get_jobs_for_session,
    get_latest_resume as db_get_latest_resume,
    get_resume,
    list_applications as db_list_applications,
    list_recent_jobs,
    list_resumes as db_list_resumes,
    list_sessions,
    search_jobs as db_search_jobs,
    upsert_application,
)


def _job_rows_to_dicts(rows: list[tuple]) -> list[dict]:
    jobs: list[dict] = []
    for title, company, location, url, source in rows:
        jobs.append(
            {
                "title": title,
                "company": company,
                "location": location,
                "url": url,
                "source": source,
            }
        )
    return jobs


def _safe_company(value: Any) -> str | None:
    if value is None:
        return None
    name = str(value).strip()
    return name or None


@tool
def list_recent_sessions(limit: int = 20) -> list[dict]:
    """List recent search sessions."""
    rows = list_sessions(limit)
    return [
        {
            "id": r[0],
            "job_title": r[1],
            "location": r[2],
            "work_style": r[3],
            "k": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]


@tool
def get_session_jobs(session_id: int) -> list[dict]:
    """Get jobs for a given session id."""
    rows = get_jobs_for_session(int(session_id))
    return _job_rows_to_dicts(rows)


@tool
def list_jobs(limit: int = 20) -> list[dict]:
    """List the most recent jobs saved in the database."""
    return list_recent_jobs(limit)


@tool
def search_jobs(query: str, limit: int = 10, status: str | None = None) -> list[dict]:
    """Search saved jobs by title, company, location, source, or description."""
    return db_search_jobs(query=query, limit=limit, status=status)


@tool
def get_job_details(job_id: str) -> dict | None:
    """Fetch one saved job by job_id."""
    return get_job(job_id)


@tool
def top_companies(session_id: int | None = None, limit: int = 10) -> list[dict]:
    """Return the most common companies in a session or across recent jobs."""
    if session_id is None:
        jobs = list_recent_jobs(500)
    else:
        jobs = _job_rows_to_dicts(get_jobs_for_session(int(session_id)))

    counts = Counter(_safe_company(j.get("company")) for j in jobs)
    if None in counts:
        del counts[None]

    return [
        {"company": company, "count": count}
        for company, count in counts.most_common(int(limit))
    ]


@tool
def list_resumes(limit: int = 20) -> list[dict]:
    """List saved resumes."""
    resumes = db_list_resumes(limit)
    return [
        {
            "id": resume["id"],
            "filename": resume["filename"],
            "created_at": resume["created_at"],
        }
        for resume in resumes
    ]


@tool
def get_resume_details(resume_id: int | None = None) -> dict | None:
    """Fetch a saved resume by resume_id. If omitted, returns the latest resume."""
    if resume_id is None:
        row = db_get_latest_resume()
        if not row:
            return None
        return {"id": row[0], "filename": row[1], "text": row[2], "created_at": row[3]}
    return get_resume(int(resume_id))


@tool
def rank_jobs_for_resume(
    resume_id: int | None = None, query: str = "", top_k: int = 5
) -> list[dict]:
    """Rank saved jobs against a specific resume or the latest resume."""
    if resume_id is None:
        latest = db_get_latest_resume()
        if not latest:
            return []
        resume_text = latest[2]
    else:
        resume = get_resume(int(resume_id))
        if not resume:
            return []
        resume_text = resume["text"]

    jobs = db_search_jobs(query=query, limit=500) if query.strip() else list_recent_jobs(500)
    ranked = rank_jobs(resume_text, jobs, top_k=int(top_k))
    return [{"score": float(score), "job": job} for job, score in ranked]


@tool
def list_applications(status: str | None = None, limit: int = 20) -> list[dict]:
    """List tracked job applications, optionally filtered by status."""
    return db_list_applications(status=status, limit=limit)


@tool
def get_application(job_id: str) -> dict | None:
    """Fetch the application record for a given job_id."""
    return get_application_by_job(job_id)


@tool
def save_application(
    job_id: str,
    status: str = "saved",
    resume_id: int | None = None,
    notes: str = "",
) -> dict:
    """Create or update the tracked application for a job."""
    return upsert_application(
        job_id=job_id,
        resume_id=resume_id,
        status=status,
        notes=notes,
    )


@tool
def web_search_jobs(query: str) -> list[dict]:
    """Search the web for new job postings. Use only if user asks to find new jobs online."""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return [{"error": "Missing TAVILY_API_KEY"}]

    client = TavilyClient(api_key=api_key)
    result = client.search(query=query, max_results=5, include_raw_content=False)
    items = result.get("results", [])
    return [
        {
            "title": r.get("title"),
            "url": r.get("url"),
            "snippet": r.get("content"),
        }
        for r in items
    ]
