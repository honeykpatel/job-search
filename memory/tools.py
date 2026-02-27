from __future__ import annotations

from collections import Counter
from typing import Any

import os

from langchain_core.tools import tool
from tavily import TavilyClient

from matching.tfidf_ranker import rank_jobs
from storage.db import (
    get_jobs_for_session,
    get_latest_resume as db_get_latest_resume,
    list_recent_jobs,
    list_sessions,
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
def get_latest_resume() -> dict | None:
    """Return the latest resume or None."""
    row = db_get_latest_resume()
    if not row:
        return None
    return {"id": row[0], "filename": row[1], "text": row[2], "created_at": row[3]}


@tool
def rank_jobs_for_resume(session_id: int | None = None, top_k: int = 5) -> list[dict]:
    """Rank jobs against the latest resume using TF-IDF."""
    latest = db_get_latest_resume()
    if not latest:
        return []

    if session_id is None:
        jobs = list_recent_jobs(500)
    else:
        jobs = _job_rows_to_dicts(get_jobs_for_session(int(session_id)))

    ranked = rank_jobs(latest[2], jobs, top_k=int(top_k))
    return [
        {
            "score": float(score),
            "job": job,
        }
        for job, score in ranked
    ]


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
