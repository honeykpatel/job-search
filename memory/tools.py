from __future__ import annotations

from collections import Counter
from contextvars import ContextVar
import os
from typing import Any

from langchain_core.tools import tool
from tavily import TavilyClient

from matching.tfidf_ranker import rank_jobs
from storage.db import (
    create_chat_thread,
    delete_chat_thread,
    get_application_by_job,
    get_job,
    get_chat_thread,
    get_jobs_for_session,
    get_latest_resume as db_get_latest_resume,
    get_resume,
    list_chat_threads,
    list_applications as db_list_applications,
    list_recent_jobs,
    list_resumes as db_list_resumes,
    list_sessions,
    search_jobs as db_search_jobs,
    update_chat_thread_title,
    upsert_application,
)

ACTIVE_USER_ID: ContextVar[str | None] = ContextVar("active_user_id", default=None)


def set_active_user_id(user_id: str | None):
    return ACTIVE_USER_ID.set(user_id)


def reset_active_user_id(token) -> None:
    ACTIVE_USER_ID.reset(token)


def _current_user_id() -> str | None:
    return ACTIVE_USER_ID.get()


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


def _helper_job_candidates(job_reference: str, limit: int = 5) -> list[dict]:
    reference = (job_reference or "").strip()
    if not reference:
        return []

    matches = db_search_jobs(query=reference, limit=max(int(limit), 1), user_id=_current_user_id())
    return [
        {
            "id": job.get("id"),
            "title": job.get("title"),
            "company": job.get("company"),
            "location": job.get("location"),
            "source": job.get("source"),
            "created_at": job.get("created_at"),
        }
        for job in matches
    ]


def _helper_resume_options(limit: int = 20) -> list[dict]:
    resumes = db_list_resumes(limit, user_id=_current_user_id())
    return [
        {
            "id": resume["id"],
            "filename": resume["filename"],
            "created_at": resume["created_at"],
        }
        for resume in resumes
    ]


def _application_preview(
    job_id: str,
    status: str | None,
    resume_id: int | None,
    notes: str | None,
    action_type: str,
) -> dict:
    job = get_job(job_id, user_id=_current_user_id())
    if not job:
        raise ValueError(f"Unknown job_id: {job_id}")

    current = get_application_by_job(job_id, user_id=_current_user_id())
    resolved_status = (
        status.strip()
        if isinstance(status, str) and status.strip()
        else (current.get("status") if current else "saved")
    )
    resolved_resume_id = resume_id if resume_id is not None else (current.get("resume_id") if current else None)
    resolved_notes = (
        notes
        if notes is not None
        else (current.get("notes") if current else "")
    )
    resume = get_resume(int(resolved_resume_id), user_id=_current_user_id()) if resolved_resume_id is not None else None
    return {
        "job": {
            "id": job.get("id"),
            "title": job.get("title"),
            "company": job.get("company"),
            "location": job.get("location"),
        },
        "current_application": current,
        "proposed_application": {
            "job_id": job_id,
            "status": resolved_status,
            "resume_id": resolved_resume_id,
            "resume_filename": resume.get("filename") if resume else None,
            "notes": resolved_notes,
        },
        "action": {
            "type": action_type,
            "params": {
                "job_id": job_id,
                "status": resolved_status,
                "resume_id": resolved_resume_id,
                "notes": resolved_notes,
            },
        },
    }


@tool
def list_recent_sessions(limit: int = 20) -> list[dict]:
    """List recent search sessions."""
    rows = list_sessions(limit, user_id=_current_user_id())
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
    rows = get_jobs_for_session(int(session_id), user_id=_current_user_id())
    return _job_rows_to_dicts(rows)


@tool
def list_jobs(limit: int = 20) -> list[dict]:
    """List the most recent jobs saved in the database."""
    return list_recent_jobs(limit, user_id=_current_user_id())


@tool
def search_jobs(query: str, limit: int = 10, status: str | None = None) -> list[dict]:
    """Search saved jobs by title, company, location, source, or description."""
    return db_search_jobs(query=query, limit=limit, status=status, user_id=_current_user_id())


@tool
def get_job_details(job_id: str) -> dict | None:
    """Fetch one saved job by job_id."""
    return get_job(job_id, user_id=_current_user_id())


@tool
def top_companies(session_id: int | None = None, limit: int = 10) -> list[dict]:
    """Return the most common companies in a session or across recent jobs."""
    if session_id is None:
        jobs = list_recent_jobs(500, user_id=_current_user_id())
    else:
        jobs = _job_rows_to_dicts(get_jobs_for_session(int(session_id), user_id=_current_user_id()))

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
    resumes = db_list_resumes(limit, user_id=_current_user_id())
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
        row = db_get_latest_resume(user_id=_current_user_id())
        if not row:
            return None
        return {"id": row[0], "filename": row[1], "text": row[2], "created_at": row[3]}
    return get_resume(int(resume_id), user_id=_current_user_id())


@tool
def rank_jobs_for_resume(
    resume_id: int | None = None, query: str = "", top_k: int = 5
) -> list[dict]:
    """Rank saved jobs against a specific resume or the latest resume."""
    if resume_id is None:
        latest = db_get_latest_resume(user_id=_current_user_id())
        if not latest:
            return []
        resume_text = latest[2]
    else:
        resume = get_resume(int(resume_id), user_id=_current_user_id())
        if not resume:
            return []
        resume_text = resume["text"]

    jobs = db_search_jobs(query=query, limit=500, user_id=_current_user_id()) if query.strip() else list_recent_jobs(500, user_id=_current_user_id())
    ranked = rank_jobs(resume_text, jobs, top_k=int(top_k))
    return [{"score": float(score), "job": job} for job, score in ranked]


@tool
def list_applications(status: str | None = None, limit: int = 20) -> list[dict]:
    """List tracked job applications, optionally filtered by status."""
    return db_list_applications(status=status, limit=limit, user_id=_current_user_id())


@tool
def get_application(job_id: str) -> dict | None:
    """Fetch the application record for a given job_id."""
    return get_application_by_job(job_id, user_id=_current_user_id())


@tool
def save_application(
    job_id: str,
    status: str | None = None,
    resume_id: int | None = None,
    notes: str | None = None,
    confirm: bool = False,
) -> dict:
    """Create or update the tracked application for a job. Preview first unless confirm=true."""
    preview = _application_preview(
        job_id=job_id,
        status=status,
        resume_id=resume_id,
        notes=notes,
        action_type="save_application",
    )
    if not confirm:
        return {
            "ok": False,
            "needs_confirmation": True,
            "message": "This will write to the application tracker. Ask the user for confirmation before proceeding.",
            "preview": preview,
        }
    return upsert_application(
        job_id=job_id,
        resume_id=resume_id,
        status=preview["proposed_application"]["status"],
        notes=preview["proposed_application"]["notes"],
        user_id=_current_user_id(),
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


@tool
def list_helpers(limit: int = 50) -> list[dict]:
    """List existing Helper threads."""
    threads = list_chat_threads(limit, user_id=_current_user_id())
    return [
        {
            "id": thread["id"],
            "title": thread["title"],
            "job_id": thread["job_id"],
            "resume_id": thread["resume_id"],
            "created_at": thread["created_at"],
            "updated_at": thread["updated_at"],
        }
        for thread in threads
        if thread.get("thread_type") == "job"
    ]


@tool
def create_helper(
    job_id: str = "",
    resume_id: int | None = None,
    title: str = "",
    job_reference: str = "",
    confirm: bool = False,
) -> dict:
    """
    Create a new Helper thread for one saved job and one saved resume.
    Use job_id when known. If the user only gives a job title/company description, pass it as job_reference.
    If resume_id is missing, this tool returns the available resumes so the agent can ask the user to choose.
    """
    resolved_job = None
    resolved_job_id = (job_id or "").strip()
    if resolved_job_id:
        resolved_job = get_job(resolved_job_id, user_id=_current_user_id())
        if not resolved_job:
            fallback_candidates = _helper_job_candidates(resolved_job_id)
            if len(fallback_candidates) == 1:
                resolved_job_id = str(fallback_candidates[0]["id"])
                resolved_job = get_job(resolved_job_id, user_id=_current_user_id())
            else:
                return {
                    "ok": False,
                    "needs_job_selection": True,
                    "message": f"No saved job was found for job_id '{resolved_job_id}'.",
                    "job_candidates": fallback_candidates,
                }
    else:
        candidates = _helper_job_candidates(job_reference)
        if not candidates:
            return {
                "ok": False,
                "needs_job_selection": True,
                "message": "No saved jobs matched that job reference.",
                "job_candidates": [],
            }
        if len(candidates) != 1:
            return {
                "ok": False,
                "needs_job_selection": True,
                "message": "Multiple saved jobs matched that job reference. Ask the user to choose one.",
                "job_candidates": candidates,
            }
        resolved_job_id = str(candidates[0]["id"])
        resolved_job = get_job(resolved_job_id, user_id=_current_user_id())

    if not resolved_job:
        return {
            "ok": False,
            "needs_job_selection": True,
            "message": "Unable to resolve the requested saved job.",
            "job_candidates": _helper_job_candidates(job_reference or resolved_job_id),
        }

    if resume_id is None:
        return {
            "ok": False,
            "needs_resume_selection": True,
            "message": (
                "A resume is required to create a Helper. Ask the user to choose one of the saved resumes."
            ),
            "job": {
                "id": resolved_job.get("id"),
                "title": resolved_job.get("title"),
                "company": resolved_job.get("company"),
                "location": resolved_job.get("location"),
            },
            "resume_options": _helper_resume_options(),
        }

    resume = get_resume(int(resume_id), user_id=_current_user_id())
    if not resume:
        return {
            "ok": False,
            "needs_resume_selection": True,
            "message": f"No saved resume was found for resume_id '{resume_id}'.",
            "job": {
                "id": resolved_job.get("id"),
                "title": resolved_job.get("title"),
                "company": resolved_job.get("company"),
                "location": resolved_job.get("location"),
            },
            "resume_options": _helper_resume_options(),
        }

    helper_title = title.strip() or (
        f"{resolved_job.get('title') or 'Untitled job'} @ "
        f"{resolved_job.get('company') or 'Unknown company'} "
        f"[{resume.get('filename') or 'No resume'}]"
    )
    preview = {
        "title": helper_title,
        "thread_type": "job",
        "job": {
            "id": resolved_job.get("id"),
            "title": resolved_job.get("title"),
            "company": resolved_job.get("company"),
            "location": resolved_job.get("location"),
        },
        "resume": {
            "id": resume.get("id"),
            "filename": resume.get("filename"),
            "created_at": resume.get("created_at"),
        },
        "action": {
            "type": "create_helper",
            "params": {
                "job_id": resolved_job_id,
                "resume_id": int(resume_id),
                "title": title.strip(),
                "job_reference": job_reference.strip(),
            },
        },
    }
    if not confirm:
        return {
            "ok": False,
            "needs_confirmation": True,
            "message": "This will create a new Helper. Ask the user for confirmation before proceeding.",
            "preview": preview,
        }

    thread_id = create_chat_thread(
        title=helper_title,
        thread_type="job",
        job_id=resolved_job_id,
        resume_id=int(resume_id),
        user_id=_current_user_id(),
    )
    thread = get_chat_thread(thread_id, user_id=_current_user_id())
    if not thread:
        raise ValueError("Failed to load Helper after creation.")
    return {"ok": True, "helper": thread}


@tool
def rename_helper(helper_id: int, title: str, confirm: bool = False) -> dict:
    """Rename an existing Helper thread. Preview first unless confirm=true."""
    helper = get_chat_thread(int(helper_id), user_id=_current_user_id())
    if not helper or helper.get("thread_type") != "job":
        raise ValueError(f"Unknown Helper id: {helper_id}")

    new_title = title.strip()
    if not new_title:
        raise ValueError("Helper title cannot be empty.")

    preview = {
        "helper_id": int(helper_id),
        "current_title": helper.get("title"),
        "new_title": new_title,
        "action": {
            "type": "rename_helper",
            "params": {
                "helper_id": int(helper_id),
                "title": new_title,
            },
        },
    }
    if not confirm:
        return {
            "ok": False,
            "needs_confirmation": True,
            "message": "This will rename a Helper. Ask the user for confirmation before proceeding.",
            "preview": preview,
        }

    update_chat_thread_title(int(helper_id), new_title, user_id=_current_user_id())
    updated = get_chat_thread(int(helper_id), user_id=_current_user_id())
    if not updated:
        raise ValueError("Failed to load Helper after rename.")
    return updated


@tool
def delete_helper(helper_id: int, confirm: bool = False) -> dict:
    """Delete an existing Helper thread. Preview first unless confirm=true."""
    helper = get_chat_thread(int(helper_id), user_id=_current_user_id())
    if not helper or helper.get("thread_type") != "job":
        raise ValueError(f"Unknown Helper id: {helper_id}")

    preview = {
        "helper_id": int(helper_id),
        "title": helper.get("title"),
        "job_id": helper.get("job_id"),
        "resume_id": helper.get("resume_id"),
        "created_at": helper.get("created_at"),
        "updated_at": helper.get("updated_at"),
        "action": {
            "type": "delete_helper",
            "params": {
                "helper_id": int(helper_id),
            },
        },
    }
    if not confirm:
        return {
            "ok": False,
            "needs_confirmation": True,
            "message": "This will delete a Helper. Ask the user for confirmation before proceeding.",
            "preview": preview,
        }

    delete_chat_thread(int(helper_id), user_id=_current_user_id())
    return {"ok": True, "deleted_helper_id": int(helper_id)}
