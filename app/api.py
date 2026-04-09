from __future__ import annotations

import ast
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from collectors.api_adzuna import search_adzuna
from app.auth import auth_config, require_user_id
from app.auth import require_admin, verify_admin_login
from app.conversation import (
    build_langchain_messages,
    build_thread_context,
    interleave_jobs,
    thread_title_from_context,
)
from app.pipeline import build_pipeline_summary
from matching.tfidf_ranker import rank_jobs
from memory.graph import build_graph, get_memory_setup_error
from memory.tools import reset_active_user_id, set_active_user_id
from parsing.resume_text import extract_text
from storage.db import (
    add_chat_message,
    admin_delete_table_row,
    admin_get_table_data,
    admin_insert_table_row,
    admin_list_tables,
    admin_update_table_row,
    clear_chat_thread,
    create_chat_thread,
    delete_application,
    delete_chat_thread,
    delete_resume,
    delete_session,
    get_chat_messages,
    get_chat_thread,
    get_job,
    get_jobs_for_session,
    get_latest_resume,
    get_or_create_general_thread,
    get_resume,
    get_user_profile,
    init_db,
    list_applications,
    list_chat_threads,
    list_recent_jobs,
    list_resumes,
    list_sessions,
    save_jobs_for_session,
    save_resume,
    save_user_account_profile,
    save_session,
    save_user_profile,
    search_jobs as db_search_jobs,
    touch_chat_thread,
    update_chat_thread_title,
    update_resume_filename,
    update_session_title,
    upsert_application,
)
from utils.company_inference import ensure_job_company
from utils.dedupe import dedupe_jobs


load_dotenv()
init_db()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

app = FastAPI(title="Job Pilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@dataclass
class _UploadedBytesFile:
    name: str
    data: bytes

    def read(self) -> bytes:
        return self.data


class SearchRequest(BaseModel):
    job_title: str
    location: str = ""
    work_style: str = "Any"
    k: int = Field(default=5, ge=1, le=20)
    save_results: bool = True


class ApplicationUpdateRequest(BaseModel):
    resume_id: int | None = None
    status: str = "saved"
    notes: str = ""


class ProfileUpdateRequest(BaseModel):
    summary_text: str = ""


class AccountUpdateRequest(BaseModel):
    full_name: str = ""
    phone: str = ""


class CreateThreadRequest(BaseModel):
    job_id: str
    resume_id: int


class ChatRequest(BaseModel):
    content: str
    show_tool_debug: bool = False


class ApprovalActionRequest(BaseModel):
    action_type: str
    params: dict[str, Any] = Field(default_factory=dict)


class RenameRequest(BaseModel):
    title: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminRowCreateRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


class AdminRowUpdateRequest(BaseModel):
    primary_key: dict[str, Any] = Field(default_factory=dict)
    values: dict[str, Any] = Field(default_factory=dict)


class AdminRowDeleteRequest(BaseModel):
    primary_key: dict[str, Any] = Field(default_factory=dict)


def _parse_tool_payload(content: Any) -> dict[str, Any] | None:
    if isinstance(content, dict):
        return content
    if not isinstance(content, str):
        return None

    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(content)
        except (ValueError, SyntaxError, json.JSONDecodeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _execute_approved_action(
    thread: dict[str, Any],
    action_type: str,
    params: dict[str, Any],
    user_id: str,
) -> dict[str, Any]:
    if action_type == "save_application":
        return upsert_application(
            job_id=str(params["job_id"]),
            resume_id=params.get("resume_id"),
            status=str(params["status"]),
            notes=str(params.get("notes") or ""),
            user_id=user_id,
        )

    if action_type == "update_current_application":
        job_id = thread.get("job_id")
        if not job_id:
            raise HTTPException(status_code=400, detail="Current thread has no job attached")
        return upsert_application(
            job_id=str(job_id),
            resume_id=params.get("resume_id"),
            status=str(params["status"]),
            notes=str(params.get("notes") or ""),
            user_id=user_id,
        )

    if action_type == "create_helper":
        job_id = str(params["job_id"])
        resume_id = int(params["resume_id"])
        job = get_job(job_id, user_id=user_id)
        resume = get_resume(resume_id, user_id=user_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        title = (str(params.get("title") or "")).strip() or thread_title_from_context(job, resume)
        thread_id = create_chat_thread(
            title=title,
            thread_type="job",
            job_id=job_id,
            resume_id=resume_id,
            user_id=user_id,
        )
        created = get_chat_thread(thread_id, user_id=user_id)
        if not created:
            raise HTTPException(status_code=500, detail="Failed to create Helper")
        return created

    if action_type == "rename_helper":
        helper_id = int(params["helper_id"])
        helper = get_chat_thread(helper_id, user_id=user_id)
        if not helper or helper.get("thread_type") != "job":
            raise HTTPException(status_code=404, detail="Helper not found")
        from storage.db import update_chat_thread_title

        update_chat_thread_title(helper_id, str(params["title"]).strip(), user_id=user_id)
        updated = get_chat_thread(helper_id, user_id=user_id)
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to rename Helper")
        return updated

    if action_type == "delete_helper":
        helper_id = int(params["helper_id"])
        helper = get_chat_thread(helper_id, user_id=user_id)
        if not helper or helper.get("thread_type") != "job":
            raise HTTPException(status_code=404, detail="Helper not found")
        delete_chat_thread(helper_id, user_id=user_id)
        return {"ok": True, "deleted_helper_id": helper_id}

    raise HTTPException(status_code=400, detail=f"Unsupported approval action: {action_type}")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/config")
def get_auth_config() -> dict[str, str]:
    return auth_config()


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest) -> dict[str, Any]:
    return verify_admin_login(payload.username, payload.password)


@app.get("/api/admin/session")
def get_admin_session(admin_session: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return {
        "username": admin_session.get("sub"),
        "expires_at": admin_session.get("exp"),
    }


@app.get("/api/admin/tables")
def get_admin_tables(admin_session: dict[str, Any] = Depends(require_admin)) -> list[dict[str, Any]]:
    _ = admin_session
    return admin_list_tables()


@app.get("/api/admin/tables/{table_name}")
def get_admin_table(
    table_name: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    search: str = "",
    admin_session: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    _ = admin_session
    try:
        return admin_get_table_data(table_name, limit=limit, offset=offset, search=search)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/admin/tables/{table_name}/rows")
def create_admin_table_row(
    table_name: str,
    payload: AdminRowCreateRequest,
    admin_session: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    _ = admin_session
    try:
        return admin_insert_table_row(table_name, payload.values)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/admin/tables/{table_name}/rows")
def update_admin_table_row(
    table_name: str,
    payload: AdminRowUpdateRequest,
    admin_session: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    _ = admin_session
    try:
        return admin_update_table_row(table_name, payload.primary_key, payload.values)
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@app.delete("/api/admin/tables/{table_name}/rows")
def delete_admin_table_row(
    table_name: str,
    payload: AdminRowDeleteRequest,
    admin_session: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    _ = admin_session
    try:
        deleted = admin_delete_table_row(table_name, payload.primary_key)
    except ValueError as exc:
        status_code = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    return {"ok": True, "deleted": deleted}


@app.post("/api/search")
def run_search(payload: SearchRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    job_title = payload.job_title.strip()
    if not job_title:
        raise HTTPException(status_code=400, detail="job_title is required")

    try:
        jobs_adzuna = search_adzuna(job_title, payload.location.strip(), payload.work_style, payload.k)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    jobs = interleave_jobs([jobs_adzuna], payload.k)
    jobs = [ensure_job_company(job) for job in jobs]
    jobs = dedupe_jobs(jobs)[: payload.k]

    session_id: int | None = None
    if payload.save_results:
        session_id = save_session(
            job_title,
            payload.location.strip(),
            payload.work_style,
            payload.k,
            user_id=current_user_id,
        )
        save_jobs_for_session(session_id, jobs, user_id=current_user_id)

    return {
        "session_id": session_id,
        "jobs": jobs,
        "sources": {
            "adzuna": len(jobs_adzuna),
        },
    }


@app.get("/api/sessions")
def get_sessions(limit: int = Query(default=100, ge=1, le=500), current_user_id: str = Depends(require_user_id)) -> list[dict[str, Any]]:
    rows = list_sessions(limit, user_id=current_user_id)
    return [
        {
            "id": row[0],
            "job_title": row[1],
            "location": row[2],
            "work_style": row[3],
            "k": row[4],
            "created_at": row[5],
            "job_count": row[6],
        }
        for row in rows
    ]


@app.get("/api/sessions/{session_id}/jobs")
def get_session_jobs_route(session_id: int, current_user_id: str = Depends(require_user_id)) -> list[dict[str, Any]]:
    return get_jobs_for_session(session_id, user_id=current_user_id)


@app.delete("/api/sessions/{session_id}")
def delete_session_route(session_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    return delete_session(session_id, user_id=current_user_id)


@app.put("/api/sessions/{session_id}")
def rename_session_route(
    session_id: int,
    payload: RenameRequest,
    current_user_id: str = Depends(require_user_id),
) -> dict[str, Any]:
    update_session_title(session_id, payload.title, user_id=current_user_id)
    rows = list_sessions(limit=500, user_id=current_user_id)
    for row in rows:
        if int(row[0]) == int(session_id):
            return {
                "id": row[0],
                "job_title": row[1],
                "location": row[2],
                "work_style": row[3],
                "k": row[4],
                "created_at": row[5],
                "job_count": row[6],
            }
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/api/jobs")
def get_jobs(
    query: str = "",
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = None,
    current_user_id: str = Depends(require_user_id),
) -> list[dict[str, Any]]:
    return db_search_jobs(query=query, limit=limit, status=status, user_id=current_user_id)


@app.get("/api/jobs/recent")
def get_recent_jobs(limit: int = Query(default=200, ge=1, le=500), current_user_id: str = Depends(require_user_id)) -> list[dict[str, Any]]:
    return list_recent_jobs(limit, user_id=current_user_id)


@app.get("/api/jobs/{job_id}")
def get_job_route(job_id: str, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    job = get_job(job_id, user_id=current_user_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/resumes")
def get_resumes(limit: int = Query(default=100, ge=1, le=500), current_user_id: str = Depends(require_user_id)) -> list[dict[str, Any]]:
    return list_resumes(limit, user_id=current_user_id)


@app.get("/api/resumes/latest")
def get_latest_resume_route(current_user_id: str = Depends(require_user_id)) -> dict[str, Any] | None:
    row = get_latest_resume(user_id=current_user_id)
    if not row:
        return None
    return {"id": row[0], "filename": row[1], "text": row[2], "created_at": row[3]}


@app.get("/api/resumes/{resume_id}")
def get_resume_route(resume_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    resume = get_resume(resume_id, user_id=current_user_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@app.post("/api/resumes")
async def upload_resume(file: UploadFile = File(...), current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    try:
        payload = _UploadedBytesFile(name=file.filename, data=await file.read())
        text = extract_text(payload)
        resume_id = save_resume(file.filename, text, user_id=current_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "id": resume_id,
        "filename": file.filename,
        "text": text,
        "created_at": get_resume(resume_id, user_id=current_user_id)["created_at"],
    }


@app.delete("/api/resumes/{resume_id}")
def delete_resume_route(resume_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, bool]:
    delete_resume(resume_id, user_id=current_user_id)
    return {"ok": True}


@app.put("/api/resumes/{resume_id}")
def rename_resume_route(
    resume_id: int,
    payload: RenameRequest,
    current_user_id: str = Depends(require_user_id),
) -> dict[str, Any]:
    update_resume_filename(resume_id, payload.title, user_id=current_user_id)
    resume = get_resume(resume_id, user_id=current_user_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@app.get("/api/matches")
def get_matches(
    resume_id: int | None = None,
    query: str = "",
    top_k: int = Query(default=5, ge=1, le=50),
    current_user_id: str = Depends(require_user_id),
) -> dict[str, Any]:
    if resume_id is None:
        row = get_latest_resume(user_id=current_user_id)
        if not row:
            return {"resume": None, "matches": []}
        resume = {"id": row[0], "filename": row[1], "text": row[2], "created_at": row[3]}
    else:
        resume = get_resume(resume_id, user_id=current_user_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")

    jobs = db_search_jobs(query=query, limit=500, user_id=current_user_id) if query.strip() else list_recent_jobs(500, user_id=current_user_id)
    ranked = rank_jobs(resume["text"], jobs, top_k=top_k)
    return {
        "resume": {
            "id": resume["id"],
            "filename": resume["filename"],
            "created_at": resume["created_at"],
        },
        "matches": [{"score": float(score), "job": job} for job, score in ranked],
    }


@app.get("/api/applications")
def get_applications(
    status: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    current_user_id: str = Depends(require_user_id),
) -> list[dict[str, Any]]:
    return list_applications(status=status, limit=limit, user_id=current_user_id)


@app.put("/api/applications/{job_id}")
def update_application(job_id: str, payload: ApplicationUpdateRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    try:
        updated = upsert_application(
            job_id=job_id,
            resume_id=payload.resume_id,
            status=payload.status,
            notes=payload.notes,
            user_id=current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return updated


@app.delete("/api/applications/{job_id}")
def delete_application_route(job_id: str, current_user_id: str = Depends(require_user_id)) -> dict[str, bool]:
    delete_application(job_id, user_id=current_user_id)
    return {"ok": True}


@app.get("/api/profile")
def get_profile(current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    return get_user_profile(user_id=current_user_id) or {"full_name": "", "phone": "", "summary_text": ""}


@app.get("/api/account")
def get_account(current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    profile = get_user_profile(user_id=current_user_id) or {}
    return {
        "full_name": str(profile.get("full_name") or ""),
        "phone": str(profile.get("phone") or ""),
        "summary_text": str(profile.get("summary_text") or ""),
    }


@app.get("/api/pipeline-summary")
def get_pipeline_summary(current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    return build_pipeline_summary(user_id=current_user_id)


@app.put("/api/profile")
def update_profile(payload: ProfileUpdateRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    return save_user_profile(payload.summary_text, user_id=current_user_id)


@app.put("/api/account")
def update_account(payload: AccountUpdateRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    profile = save_user_account_profile(payload.full_name, payload.phone, user_id=current_user_id)
    return {
        "full_name": str(profile.get("full_name") or ""),
        "phone": str(profile.get("phone") or ""),
        "summary_text": str(profile.get("summary_text") or ""),
        "updated_at": profile.get("updated_at"),
    }


@app.get("/api/threads")
def get_threads(limit: int = Query(default=100, ge=1, le=500), current_user_id: str = Depends(require_user_id)) -> list[dict[str, Any]]:
    return list_chat_threads(limit, user_id=current_user_id)


@app.post("/api/threads/general")
def create_general_thread(current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    thread_id = get_or_create_general_thread(user_id=current_user_id)
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=500, detail="Failed to load general thread")
    return thread


@app.post("/api/threads/job")
def create_job_thread(payload: CreateThreadRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    job = get_job(payload.job_id, user_id=current_user_id)
    resume = get_resume(payload.resume_id, user_id=current_user_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    thread_id = create_chat_thread(
        title=thread_title_from_context(job, resume),
        thread_type="job",
        job_id=payload.job_id,
        resume_id=payload.resume_id,
        user_id=current_user_id,
    )
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=500, detail="Failed to create thread")
    return thread


@app.get("/api/threads/{thread_id}")
def get_thread(thread_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    job = get_job(thread["job_id"], user_id=current_user_id) if thread.get("job_id") else None
    resume = get_resume(thread["resume_id"], user_id=current_user_id) if thread.get("resume_id") else None
    return {
        **thread,
        "job": job,
        "resume": resume,
        "messages": get_chat_messages(thread_id, user_id=current_user_id),
    }


@app.post("/api/threads/{thread_id}/clear")
def clear_thread(thread_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, bool]:
    clear_chat_thread(thread_id, user_id=current_user_id)
    touch_chat_thread(thread_id, user_id=current_user_id)
    return {"ok": True}


@app.delete("/api/threads/{thread_id}")
def delete_thread(thread_id: int, current_user_id: str = Depends(require_user_id)) -> dict[str, bool]:
    delete_chat_thread(thread_id, user_id=current_user_id)
    return {"ok": True}


@app.put("/api/threads/{thread_id}")
def rename_thread_route(
    thread_id: int,
    payload: RenameRequest,
    current_user_id: str = Depends(require_user_id),
) -> dict[str, Any]:
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    update_chat_thread_title(thread_id, payload.title, user_id=current_user_id)
    updated = get_chat_thread(thread_id, user_id=current_user_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Thread not found")
    return updated


@app.post("/api/threads/{thread_id}/messages")
def send_message(thread_id: int, payload: ChatRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message content is required")

    add_chat_message(thread_id, "user", content, user_id=current_user_id)
    existing_messages = get_chat_messages(thread_id, user_id=current_user_id)
    thread_type = thread.get("thread_type", "job")
    thread_job = get_job(thread["job_id"], user_id=current_user_id) if thread.get("job_id") else None
    thread_resume = get_resume(thread["resume_id"], user_id=current_user_id) if thread.get("resume_id") else None
    profile = get_user_profile(user_id=current_user_id)
    thread_context = build_thread_context(
        thread_job,
        thread_resume,
        profile=profile,
        thread_type=thread_type,
        pipeline_summary=build_pipeline_summary(user_id=current_user_id) if thread_type == "general" else None,
        empty_general_message=(
            "Candidate profile summary is empty. Ask the user to save their background, goals, "
            "strengths, constraints, and preferences in the Agent profile panel."
        ),
    )

    memory_setup_error = get_memory_setup_error()
    last_assistant: str | None = None
    tool_messages: list[dict[str, str]] = []
    pending_action: dict[str, Any] | None = None

    if memory_setup_error:
        last_assistant = f"Agent unavailable: {memory_setup_error}"
    else:
        try:
            graph = build_graph(
                thread_context=thread_context,
                thread_type=thread_type,
                thread_job_id=thread.get("job_id") if thread else None,
                thread_resume_id=thread.get("resume_id") if thread else None,
                thread_user_id=current_user_id,
            )
            lc_messages: list[Any] = build_langchain_messages(existing_messages)
            token = set_active_user_id(current_user_id)
            try:
                result = graph.invoke({"messages": lc_messages})
            finally:
                reset_active_user_id(token)
            new_messages = result["messages"][len(lc_messages) :]

            for message in new_messages:
                if message.type == "tool":
                    parsed = _parse_tool_payload(message.content)
                    if isinstance(parsed, dict) and parsed.get("needs_confirmation"):
                        pending_action = {
                            "tool_name": getattr(message, "name", None),
                            **parsed,
                        }
                        continue
                    add_chat_message(thread_id, "tool", message.content, user_id=current_user_id)
                    tool_messages.append({"role": "tool", "content": message.content})
                elif message.type in ("assistant", "ai"):
                    if pending_action:
                        continue
                    last_assistant = message.content
        except Exception as exc:
            last_assistant = f"Agent unavailable: {exc}"

    if last_assistant:
        add_chat_message(thread_id, "assistant", last_assistant, user_id=current_user_id)

    return {
        "assistant": last_assistant,
        "pending_action": pending_action,
        "tool_messages": tool_messages if payload.show_tool_debug else [],
        "messages": get_chat_messages(thread_id, user_id=current_user_id),
    }


@app.post("/api/threads/{thread_id}/actions/approve")
def approve_thread_action(thread_id: int, payload: ApprovalActionRequest, current_user_id: str = Depends(require_user_id)) -> dict[str, Any]:
    thread = get_chat_thread(thread_id, user_id=current_user_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    result = _execute_approved_action(
        thread=thread,
        action_type=payload.action_type,
        params=payload.params,
        user_id=current_user_id,
    )
    return {"ok": True, "result": result}


@app.get("/", response_model=None)
def serve_frontend_index() -> FileResponse | dict[str, str]:
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Frontend not built yet. Start the React dev server or run a production build."}


@app.get("/{full_path:path}", response_model=None)
def serve_frontend_assets(full_path: str) -> FileResponse | dict[str, str]:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    asset_path = FRONTEND_DIST / full_path
    index_path = FRONTEND_DIST / "index.html"
    if asset_path.exists() and asset_path.is_file():
        return FileResponse(asset_path)
    if index_path.exists() and not full_path.startswith("api/"):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")
