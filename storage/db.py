from __future__ import annotations

from datetime import datetime
import hashlib
import os
from pathlib import Path
from typing import Any

from sqlalchemy import bindparam, create_engine, event, inspect, text
from sqlalchemy.engine import Engine, Row
from sqlalchemy.pool import NullPool

from utils.company_inference import ensure_job_company

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "jobs.db"
DEFAULT_LOCAL_USER_ID = "__local_single_user__"


def _default_database_url() -> str:
    return f"sqlite:///{DB_PATH.as_posix()}"


def _normalize_database_url(url: str | None) -> str:
    raw = (url or "").strip()
    if not raw:
        return _default_database_url()
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        return "postgresql+psycopg://" + raw[len("postgresql://") :]
    return raw


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL"))


def _build_engine() -> Engine:
    engine_kwargs: dict[str, Any] = {
        "future": True,
        "pool_pre_ping": True,
    }
    if not DATABASE_URL.startswith("sqlite"):
        # Supabase already provides pooling. Disable SQLAlchemy's pool so this
        # app does not hold extra idle Postgres connections open.
        engine_kwargs["poolclass"] = NullPool

    engine = create_engine(DATABASE_URL, **engine_kwargs)

    if DATABASE_URL.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.close()

    return engine


ENGINE = _build_engine()


def get_conn():
    return ENGINE.connect()


def _utcnow() -> str:
    return datetime.utcnow().isoformat()


def _column_exists(table: str, column: str) -> bool:
    inspector = inspect(ENGINE)
    return any(item["name"] == column for item in inspector.get_columns(table))


def _ensure_column(table: str, column: str, definition: str) -> None:
    if _column_exists(table, column):
        return
    with ENGINE.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))


def _fetchall_tuples(result) -> list[tuple]:
    return [tuple(row) for row in result.fetchall()]


def _row_to_tuple(row: Row[Any] | None) -> tuple | None:
    return tuple(row) if row is not None else None


def _resolve_user_id(user_id: str | None = None) -> str:
    return (user_id or "").strip() or DEFAULT_LOCAL_USER_ID


def _user_key(user_id: str | None = None) -> str:
    return hashlib.sha256(_resolve_user_id(user_id).encode("utf-8")).hexdigest()[:12]


def _job_id(job: dict[str, Any]) -> str:
    raw = (job.get("url") or "").strip()
    if not raw:
        raw = "|".join(
            [
                str(job.get("source") or "").strip().lower(),
                str(job.get("company") or "").strip().lower(),
                str(job.get("title") or "").strip().lower(),
                str(job.get("location") or "").strip().lower(),
            ]
        )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _normalize_job(job: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    base_id = job.get("id") or _job_id(job)
    return {
        "id": f"{_user_key(user_id)}_{base_id}",
        "user_id": _resolve_user_id(user_id),
        "title": job.get("title"),
        "company": job.get("company"),
        "location": job.get("location"),
        "url": job.get("url"),
        "source": job.get("source"),
        "description": job.get("description"),
        "job_type": job.get("job_type"),
        "salary_text": job.get("salary_text"),
        "search_query": job.get("search_query"),
    }


def _job_row_to_dict(row: tuple) -> dict[str, Any]:
    job = {
        "id": row[0],
        "title": row[1],
        "company": row[2],
        "location": row[3],
        "url": row[4],
        "source": row[5],
        "description": row[6],
        "job_type": row[7],
        "salary_text": row[8],
        "search_query": row[9],
        "created_at": row[10],
        "updated_at": row[11],
        "application_id": row[12],
        "application_status": row[13],
        "resume_id": row[14],
        "application_notes": row[15],
        "application_updated_at": row[16],
    }
    return ensure_job_company(job)


def _resume_row_to_dict(row: tuple) -> dict[str, Any]:
    return {
        "id": row[0],
        "filename": row[1],
        "text": row[2],
        "created_at": row[3],
    }


def _application_row_to_dict(row: tuple) -> dict[str, Any]:
    return {
        "id": row[0],
        "job_id": row[1],
        "resume_id": row[2],
        "status": row[3],
        "notes": row[4],
        "created_at": row[5],
        "updated_at": row[6],
        "job_title": row[7],
        "company": row[8],
        "job_url": row[9],
        "resume_filename": row[10],
    }


def init_db():
    with ENGINE.begin() as conn:
        if DATABASE_URL.startswith("sqlite"):
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS search_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        job_title TEXT NOT NULL,
                        location TEXT,
                        work_style TEXT,
                        k INTEGER NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS job_postings (
                        id TEXT PRIMARY KEY,
                        user_id TEXT,
                        title TEXT,
                        company TEXT,
                        location TEXT,
                        url TEXT UNIQUE,
                        source TEXT,
                        description TEXT,
                        job_type TEXT,
                        salary_text TEXT,
                        search_query TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS session_jobs (
                        session_id INTEGER,
                        job_id TEXT,
                        PRIMARY KEY (session_id, job_id),
                        FOREIGN KEY (session_id) REFERENCES search_sessions(id) ON DELETE CASCADE,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS resumes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        filename TEXT,
                        text TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS applications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        job_id TEXT NOT NULL UNIQUE,
                        resume_id INTEGER,
                        status TEXT NOT NULL DEFAULT 'saved',
                        notes TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE CASCADE,
                        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_threads (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        title TEXT NOT NULL,
                        thread_type TEXT NOT NULL DEFAULT 'job',
                        job_id TEXT,
                        resume_id INTEGER,
                        application_id INTEGER,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE SET NULL,
                        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL,
                        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS user_profiles (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL UNIQUE,
                        summary_text TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        thread_id INTEGER NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
                    )
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS search_sessions (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        user_id TEXT,
                        job_title TEXT NOT NULL,
                        location TEXT,
                        work_style TEXT,
                        k INTEGER NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS job_postings (
                        id TEXT PRIMARY KEY,
                        user_id TEXT,
                        title TEXT,
                        company TEXT,
                        location TEXT,
                        url TEXT UNIQUE,
                        source TEXT,
                        description TEXT,
                        job_type TEXT,
                        salary_text TEXT,
                        search_query TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS session_jobs (
                        session_id INTEGER,
                        job_id TEXT,
                        PRIMARY KEY (session_id, job_id),
                        FOREIGN KEY (session_id) REFERENCES search_sessions(id) ON DELETE CASCADE,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE CASCADE
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS resumes (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        user_id TEXT,
                        filename TEXT,
                        text TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS applications (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        user_id TEXT,
                        job_id TEXT NOT NULL UNIQUE,
                        resume_id INTEGER,
                        status TEXT NOT NULL DEFAULT 'saved',
                        notes TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE CASCADE,
                        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_threads (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        user_id TEXT,
                        title TEXT NOT NULL,
                        thread_type TEXT NOT NULL DEFAULT 'job',
                        job_id TEXT,
                        resume_id INTEGER,
                        application_id INTEGER,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY (job_id) REFERENCES job_postings(id) ON DELETE SET NULL,
                        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL,
                        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS user_profiles (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        user_id TEXT NOT NULL UNIQUE,
                        summary_text TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                        thread_id INTEGER NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
                    )
                    """
                )
            )

    _ensure_column("search_sessions", "user_id", "TEXT")
    _ensure_column("job_postings", "user_id", "TEXT")
    _ensure_column("resumes", "user_id", "TEXT")
    _ensure_column("applications", "user_id", "TEXT")
    _ensure_column("chat_threads", "user_id", "TEXT")
    _ensure_column("job_postings", "description", "TEXT")
    _ensure_column("job_postings", "job_type", "TEXT")
    _ensure_column("job_postings", "salary_text", "TEXT")
    _ensure_column("job_postings", "search_query", "TEXT")
    _ensure_column("job_postings", "updated_at", "TEXT")
    _ensure_column("chat_threads", "thread_type", "TEXT NOT NULL DEFAULT 'job'")

    now = _utcnow()
    with ENGINE.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE job_postings
                SET updated_at = COALESCE(updated_at, created_at)
                WHERE updated_at IS NULL OR updated_at = ''
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE chat_threads
                SET thread_type = 'job'
                WHERE thread_type IS NULL OR thread_type = ''
                """
            )
        )
        conn.execute(
            text(
                """
                UPDATE search_sessions SET user_id = :user_id WHERE user_id IS NULL OR user_id = ''
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID},
        )
        conn.execute(
            text(
                """
                UPDATE job_postings SET user_id = :user_id WHERE user_id IS NULL OR user_id = ''
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID},
        )
        conn.execute(
            text(
                """
                UPDATE resumes SET user_id = :user_id WHERE user_id IS NULL OR user_id = ''
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID},
        )
        conn.execute(
            text(
                """
                UPDATE applications SET user_id = :user_id WHERE user_id IS NULL OR user_id = ''
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID},
        )
        conn.execute(
            text(
                """
                UPDATE chat_threads SET user_id = :user_id WHERE user_id IS NULL OR user_id = ''
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID},
        )
        conn.execute(
            text(
                """
                INSERT INTO user_profiles (user_id, summary_text, created_at, updated_at)
                VALUES (:user_id, '', :created_at, :updated_at)
                ON CONFLICT(user_id) DO NOTHING
                """
            ),
            {"user_id": DEFAULT_LOCAL_USER_ID, "created_at": now, "updated_at": now},
        )


def save_session(job_title: str, location: str, work_style: str, k: int, user_id: str | None = None) -> int:
    created_at = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO search_sessions (user_id, job_title, location, work_style, k, created_at)
                VALUES (:user_id, :job_title, :location, :work_style, :k, :created_at)
                RETURNING id
                """
            ),
            {
                "user_id": resolved_user_id,
                "job_title": job_title,
                "location": location,
                "work_style": work_style,
                "k": k,
                "created_at": created_at,
            },
        )
        return int(result.scalar_one())


def list_sessions(limit: int = 20, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT
                    s.id,
                    s.job_title,
                    s.location,
                    s.work_style,
                    s.k,
                    s.created_at,
                    COUNT(sj.job_id) AS job_count
                FROM search_sessions s
                LEFT JOIN session_jobs sj ON sj.session_id = s.id
                WHERE s.user_id = :user_id
                GROUP BY s.id, s.job_title, s.location, s.work_style, s.k, s.created_at
                ORDER BY s.id DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit), "user_id": resolved_user_id},
        )
        return _fetchall_tuples(result)


def delete_session(session_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT sj.job_id
                FROM session_jobs sj
                JOIN search_sessions s ON s.id = sj.session_id
                WHERE sj.session_id = :session_id AND s.user_id = :user_id
                """
            ),
            {"session_id": int(session_id), "user_id": resolved_user_id},
        )
        job_ids = [row[0] for row in result.fetchall()]
        deleted_thread_ids: list[int] = []

        if job_ids:
            select_threads = text(
                "SELECT id FROM chat_threads WHERE user_id = :user_id AND job_id IN :job_ids"
            ).bindparams(bindparam("job_ids", expanding=True))
            delete_threads = text(
                "DELETE FROM chat_threads WHERE user_id = :user_id AND job_id IN :job_ids"
            ).bindparams(bindparam("job_ids", expanding=True))
            delete_applications = text(
                "DELETE FROM applications WHERE user_id = :user_id AND job_id IN :job_ids"
            ).bindparams(bindparam("job_ids", expanding=True))
            delete_session_jobs = text(
                """
                DELETE FROM session_jobs
                WHERE job_id IN :job_ids AND session_id IN (
                    SELECT id FROM search_sessions WHERE user_id = :user_id
                )
                """
            ).bindparams(bindparam("job_ids", expanding=True))
            delete_jobs = text(
                "DELETE FROM job_postings WHERE user_id = :user_id AND id IN :job_ids"
            ).bindparams(bindparam("job_ids", expanding=True))

            deleted_thread_ids = [
                int(row[0]) for row in conn.execute(select_threads, {"job_ids": job_ids, "user_id": resolved_user_id}).fetchall()
            ]
            conn.execute(delete_threads, {"job_ids": job_ids, "user_id": resolved_user_id})
            conn.execute(delete_applications, {"job_ids": job_ids, "user_id": resolved_user_id})
            conn.execute(delete_session_jobs, {"job_ids": job_ids, "user_id": resolved_user_id})
            conn.execute(delete_jobs, {"job_ids": job_ids, "user_id": resolved_user_id})

        conn.execute(
            text("DELETE FROM search_sessions WHERE id = :session_id AND user_id = :user_id"),
            {"session_id": int(session_id), "user_id": resolved_user_id},
        )
        return {
            "deleted_job_ids": job_ids,
            "deleted_thread_ids": deleted_thread_ids,
        }


def save_jobs_for_session(session_id: int, jobs: list[dict], user_id: str | None = None):
    now = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        for raw_job in jobs:
            job = _normalize_job(raw_job, user_id=resolved_user_id)
            conn.execute(
                text(
                    """
                    INSERT INTO job_postings (
                        id, user_id, title, company, location, url, source, description,
                        job_type, salary_text, search_query, created_at, updated_at
                    )
                    VALUES (
                        :id, :user_id, :title, :company, :location, :url, :source, :description,
                        :job_type, :salary_text, :search_query, :created_at, :updated_at
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        user_id = excluded.user_id,
                        title = COALESCE(excluded.title, job_postings.title),
                        company = COALESCE(excluded.company, job_postings.company),
                        location = COALESCE(excluded.location, job_postings.location),
                        url = COALESCE(excluded.url, job_postings.url),
                        source = COALESCE(excluded.source, job_postings.source),
                        description = COALESCE(excluded.description, job_postings.description),
                        job_type = COALESCE(excluded.job_type, job_postings.job_type),
                        salary_text = COALESCE(excluded.salary_text, job_postings.salary_text),
                        search_query = COALESCE(excluded.search_query, job_postings.search_query),
                        updated_at = excluded.updated_at
                    """
                ),
                {
                    **job,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO session_jobs (session_id, job_id)
                    VALUES (:session_id, :job_id)
                    ON CONFLICT(session_id, job_id) DO NOTHING
                    """
                ),
                {"session_id": int(session_id), "job_id": job["id"]},
            )


def get_jobs_for_session(session_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT
                    jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                    jp.description, jp.job_type, jp.salary_text, jp.search_query,
                    jp.created_at, jp.updated_at,
                    a.id, a.status, a.resume_id, a.notes, a.updated_at
                FROM session_jobs sj
                JOIN job_postings jp ON jp.id = sj.job_id
                LEFT JOIN applications a ON a.job_id = jp.id
                JOIN search_sessions s ON s.id = sj.session_id
                WHERE sj.session_id = :session_id AND s.user_id = :user_id AND jp.user_id = :user_id
                ORDER BY jp.updated_at DESC, jp.created_at DESC
                """
            ),
            {"session_id": int(session_id), "user_id": resolved_user_id},
        )
        return [_job_row_to_dict(tuple(row)) for row in result.fetchall()]


def list_recent_jobs(limit: int = 200, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT
                    jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                    jp.description, jp.job_type, jp.salary_text, jp.search_query,
                    jp.created_at, jp.updated_at,
                    a.id, a.status, a.resume_id, a.notes, a.updated_at
                FROM job_postings jp
                LEFT JOIN applications a ON a.job_id = jp.id
                WHERE jp.user_id = :user_id
                ORDER BY jp.updated_at DESC, jp.created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit), "user_id": resolved_user_id},
        )
        return [_job_row_to_dict(tuple(row)) for row in result.fetchall()]


def search_jobs(query: str = "", limit: int = 20, status: str | None = None, user_id: str | None = None):
    query_text = query.strip()
    params: dict[str, Any] = {"limit": int(limit), "user_id": _resolve_user_id(user_id)}
    where: list[str] = []
    where.append("jp.user_id = :user_id")
    if query_text:
        where.append(
            """
            (
                lower(COALESCE(jp.title, '')) LIKE :like
                OR lower(COALESCE(jp.company, '')) LIKE :like
                OR lower(COALESCE(jp.location, '')) LIKE :like
                OR lower(COALESCE(jp.source, '')) LIKE :like
                OR lower(COALESCE(jp.description, '')) LIKE :like
            )
            """
        )
        params["like"] = f"%{query_text.lower()}%"
    if status:
        where.append("COALESCE(a.status, 'saved') = :status")
        params["status"] = status

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                f"""
                SELECT
                    jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                    jp.description, jp.job_type, jp.salary_text, jp.search_query,
                    jp.created_at, jp.updated_at,
                    a.id, a.status, a.resume_id, a.notes, a.updated_at
                FROM job_postings jp
                LEFT JOIN applications a ON a.job_id = jp.id
                {where_sql}
                ORDER BY jp.updated_at DESC, jp.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        )
        return [_job_row_to_dict(tuple(row)) for row in result.fetchall()]


def get_job(job_id: str, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT
                    jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                    jp.description, jp.job_type, jp.salary_text, jp.search_query,
                    jp.created_at, jp.updated_at,
                    a.id, a.status, a.resume_id, a.notes, a.updated_at
                FROM job_postings jp
                LEFT JOIN applications a ON a.job_id = jp.id
                WHERE jp.id = :job_id AND jp.user_id = :user_id
                LIMIT 1
                """
            ),
            {"job_id": job_id, "user_id": resolved_user_id},
        )
        row = result.fetchone()
        return _job_row_to_dict(tuple(row)) if row else None


def save_resume(filename: str, resume_text: str, user_id: str | None = None) -> int:
    created_at = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO resumes (user_id, filename, text, created_at)
                VALUES (:user_id, :filename, :text, :created_at)
                RETURNING id
                """
            ),
            {"user_id": resolved_user_id, "filename": filename, "text": resume_text, "created_at": created_at},
        )
        return int(result.scalar_one())


def list_resumes(limit: int = 20, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, filename, text, created_at
                FROM resumes
                WHERE user_id = :user_id
                ORDER BY id DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit), "user_id": resolved_user_id},
        )
        return [_resume_row_to_dict(tuple(row)) for row in result.fetchall()]


def delete_resume(resume_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text("UPDATE applications SET resume_id = NULL WHERE resume_id = :resume_id AND user_id = :user_id"),
            {"resume_id": int(resume_id), "user_id": resolved_user_id},
        )
        conn.execute(
            text("UPDATE chat_threads SET resume_id = NULL WHERE resume_id = :resume_id AND user_id = :user_id"),
            {"resume_id": int(resume_id), "user_id": resolved_user_id},
        )
        conn.execute(
            text("DELETE FROM resumes WHERE id = :resume_id AND user_id = :user_id"),
            {"resume_id": int(resume_id), "user_id": resolved_user_id},
        )


def get_resume(resume_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, filename, text, created_at
                FROM resumes
                WHERE id = :resume_id AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"resume_id": int(resume_id), "user_id": resolved_user_id},
        )
        row = result.fetchone()
        return _resume_row_to_dict(tuple(row)) if row else None


def get_latest_resume(user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, filename, text, created_at
                FROM resumes
                WHERE user_id = :user_id
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"user_id": resolved_user_id},
        )
        return _row_to_tuple(result.fetchone())


def upsert_application(
    job_id: str,
    resume_id: int | None = None,
    status: str = "saved",
    notes: str = "",
    user_id: str | None = None,
):
    now = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        job_exists = conn.execute(
            text("SELECT id FROM job_postings WHERE id = :job_id AND user_id = :user_id LIMIT 1"),
            {"job_id": job_id, "user_id": resolved_user_id},
        ).fetchone()
        if job_exists is None:
            raise ValueError(f"Unknown job_id: {job_id}")

        if resume_id is not None:
            resume_exists = conn.execute(
                text("SELECT id FROM resumes WHERE id = :resume_id AND user_id = :user_id LIMIT 1"),
                {"resume_id": int(resume_id), "user_id": resolved_user_id},
            ).fetchone()
            if resume_exists is None:
                raise ValueError(f"Unknown resume_id: {resume_id}")

        conn.execute(
            text(
                """
                INSERT INTO applications (user_id, job_id, resume_id, status, notes, created_at, updated_at)
                VALUES (:user_id, :job_id, :resume_id, :status, :notes, :created_at, :updated_at)
                ON CONFLICT(job_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    resume_id = COALESCE(excluded.resume_id, applications.resume_id),
                    status = excluded.status,
                    notes = CASE
                        WHEN excluded.notes IS NULL OR excluded.notes = '' THEN applications.notes
                        ELSE excluded.notes
                    END,
                    updated_at = excluded.updated_at
                """
            ),
            {
                "user_id": resolved_user_id,
                "job_id": job_id,
                "resume_id": resume_id,
                "status": status,
                "notes": notes,
                "created_at": now,
                "updated_at": now,
            },
        )
    return get_application_by_job(job_id, user_id=resolved_user_id)


def get_application_by_job(job_id: str, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT
                    a.id, a.job_id, a.resume_id, a.status, a.notes, a.created_at, a.updated_at,
                    jp.title, jp.company, jp.url, r.filename
                FROM applications a
                JOIN job_postings jp ON jp.id = a.job_id
                LEFT JOIN resumes r ON r.id = a.resume_id
                WHERE a.job_id = :job_id AND a.user_id = :user_id
                LIMIT 1
                """
            ),
            {"job_id": job_id, "user_id": resolved_user_id},
        )
        row = result.fetchone()
        return _application_row_to_dict(tuple(row)) if row else None


def list_applications(status: str | None = None, limit: int = 50, user_id: str | None = None):
    params: dict[str, Any] = {"limit": int(limit), "user_id": _resolve_user_id(user_id)}
    where_sql = "WHERE a.user_id = :user_id"
    if status:
        where_sql += " AND a.status = :status"
        params["status"] = status

    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                f"""
                SELECT
                    a.id, a.job_id, a.resume_id, a.status, a.notes, a.created_at, a.updated_at,
                    jp.title, jp.company, jp.url, r.filename
                FROM applications a
                JOIN job_postings jp ON jp.id = a.job_id
                LEFT JOIN resumes r ON r.id = a.resume_id
                {where_sql}
                ORDER BY a.updated_at DESC, a.created_at DESC
                LIMIT :limit
                """
            ),
            params,
        )
        return [_application_row_to_dict(tuple(row)) for row in result.fetchall()]


def delete_application(job_id: str, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text("UPDATE chat_threads SET application_id = NULL WHERE job_id = :job_id AND user_id = :user_id"),
            {"job_id": job_id, "user_id": resolved_user_id},
        )
        conn.execute(
            text("DELETE FROM applications WHERE job_id = :job_id AND user_id = :user_id"),
            {"job_id": job_id, "user_id": resolved_user_id},
        )


def create_chat_thread(
    title: str = "New chat",
    thread_type: str = "job",
    job_id: str | None = None,
    resume_id: int | None = None,
    application_id: int | None = None,
    user_id: str | None = None,
):
    now = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                INSERT INTO chat_threads (
                    user_id, title, thread_type, job_id, resume_id, application_id, created_at, updated_at
                )
                VALUES (
                    :user_id, :title, :thread_type, :job_id, :resume_id, :application_id, :created_at, :updated_at
                )
                RETURNING id
                """
            ),
            {
                "user_id": resolved_user_id,
                "title": title,
                "thread_type": thread_type,
                "job_id": job_id,
                "resume_id": resume_id,
                "application_id": application_id,
                "created_at": now,
                "updated_at": now,
            },
        )
        return int(result.scalar_one())


def get_or_create_general_thread(title: str = "Agent", user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id
                FROM chat_threads
                WHERE thread_type = 'general' AND user_id = :user_id
                ORDER BY id ASC
                LIMIT 1
                """
            ),
            {"user_id": resolved_user_id},
        )
        row = result.fetchone()
        if row:
            return int(row[0])

        now = _utcnow()
        created = conn.execute(
            text(
                """
                INSERT INTO chat_threads (
                    user_id, title, thread_type, job_id, resume_id, application_id, created_at, updated_at
                )
                VALUES (:user_id, :title, 'general', NULL, NULL, NULL, :created_at, :updated_at)
                RETURNING id
                """
            ),
            {"user_id": resolved_user_id, "title": title, "created_at": now, "updated_at": now},
        )
        return int(created.scalar_one())


def update_chat_thread_title(thread_id: int, title: str, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE chat_threads
                SET title = :title, updated_at = :updated_at
                WHERE id = :thread_id AND user_id = :user_id
                """
            ),
            {
                "title": title,
                "updated_at": _utcnow(),
                "thread_id": int(thread_id),
                "user_id": resolved_user_id,
            },
        )


def touch_chat_thread(thread_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text("UPDATE chat_threads SET updated_at = :updated_at WHERE id = :thread_id AND user_id = :user_id"),
            {"updated_at": _utcnow(), "thread_id": int(thread_id), "user_id": resolved_user_id},
        )


def list_chat_threads(limit: int = 50, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, title, thread_type, job_id, resume_id, application_id, created_at, updated_at
                FROM chat_threads
                WHERE user_id = :user_id
                ORDER BY updated_at DESC, created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": int(limit), "user_id": resolved_user_id},
        )
        rows = result.fetchall()
        return [
            {
                "id": row[0],
                "title": row[1],
                "thread_type": row[2],
                "job_id": row[3],
                "resume_id": row[4],
                "application_id": row[5],
                "created_at": row[6],
                "updated_at": row[7],
            }
            for row in rows
        ]


def get_chat_thread(thread_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, title, thread_type, job_id, resume_id, application_id, created_at, updated_at
                FROM chat_threads
                WHERE id = :thread_id AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"thread_id": int(thread_id), "user_id": resolved_user_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "title": row[1],
            "thread_type": row[2],
            "job_id": row[3],
            "resume_id": row[4],
            "application_id": row[5],
            "created_at": row[6],
            "updated_at": row[7],
        }


def get_chat_messages(thread_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT cm.id, cm.role, cm.content, cm.created_at
                FROM chat_messages cm
                JOIN chat_threads ct ON ct.id = cm.thread_id
                WHERE cm.thread_id = :thread_id AND ct.user_id = :user_id
                ORDER BY cm.id ASC
                """
            ),
            {"thread_id": int(thread_id), "user_id": resolved_user_id},
        )
        rows = result.fetchall()
        return [
            {
                "id": row[0],
                "role": row[1],
                "content": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]


def add_chat_message(thread_id: int, role: str, content: str, user_id: str | None = None):
    now = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        thread_exists = conn.execute(
            text("SELECT id FROM chat_threads WHERE id = :thread_id AND user_id = :user_id"),
            {"thread_id": int(thread_id), "user_id": resolved_user_id},
        ).fetchone()
        if thread_exists is None:
            raise ValueError("Unknown thread_id")
        result = conn.execute(
            text(
                """
                INSERT INTO chat_messages (thread_id, role, content, created_at)
                VALUES (:thread_id, :role, :content, :created_at)
                RETURNING id
                """
            ),
            {
                "thread_id": int(thread_id),
                "role": role,
                "content": content,
                "created_at": now,
            },
        )
        conn.execute(
            text("UPDATE chat_threads SET updated_at = :updated_at WHERE id = :thread_id AND user_id = :user_id"),
            {"updated_at": now, "thread_id": int(thread_id), "user_id": resolved_user_id},
        )
        return int(result.scalar_one())


def clear_chat_thread(thread_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text(
                """
                DELETE FROM chat_messages
                WHERE thread_id = :thread_id
                  AND thread_id IN (SELECT id FROM chat_threads WHERE id = :thread_id AND user_id = :user_id)
                """
            ),
            {"thread_id": int(thread_id), "user_id": resolved_user_id},
        )
        conn.execute(
            text("UPDATE chat_threads SET updated_at = :updated_at WHERE id = :thread_id AND user_id = :user_id"),
            {"updated_at": _utcnow(), "thread_id": int(thread_id), "user_id": resolved_user_id},
        )


def delete_chat_thread(thread_id: int, user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text("DELETE FROM chat_threads WHERE id = :thread_id AND user_id = :user_id"),
            {"thread_id": int(thread_id), "user_id": resolved_user_id},
        )


def get_user_profile(user_id: str | None = None):
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        result = conn.execute(
            text(
                """
                SELECT id, user_id, summary_text, created_at, updated_at
                FROM user_profiles
                WHERE user_id = :user_id
                LIMIT 1
                """
            ),
            {"user_id": resolved_user_id},
        )
        row = result.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "user_id": row[1],
            "summary_text": row[2],
            "created_at": row[3],
            "updated_at": row[4],
        }


def save_user_profile(summary_text: str, user_id: str | None = None):
    now = _utcnow()
    resolved_user_id = _resolve_user_id(user_id)
    with ENGINE.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO user_profiles (user_id, summary_text, created_at, updated_at)
                VALUES (:user_id, :summary_text, :created_at, :updated_at)
                ON CONFLICT(user_id) DO UPDATE SET
                    summary_text = excluded.summary_text,
                    updated_at = excluded.updated_at
                """
            ),
            {
                "user_id": resolved_user_id,
                "summary_text": summary_text,
                "created_at": now,
                "updated_at": now,
            },
        )
    return get_user_profile(user_id=resolved_user_id)
