from __future__ import annotations

from datetime import datetime
import hashlib
from pathlib import Path
import sqlite3
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "jobs.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _utcnow() -> str:
    return datetime.utcnow().isoformat()


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def _ensure_column(
    conn: sqlite3.Connection, table: str, column: str, definition: str
) -> None:
    if not _column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    with get_conn() as conn:
        conn.execute("PRAGMA foreign_keys = ON")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS search_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_title TEXT NOT NULL,
                location TEXT,
                work_style TEXT,
                k INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS job_postings (
                id TEXT PRIMARY KEY,
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

        conn.execute(
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

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resumes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
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

        conn.execute(
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

        _ensure_column(conn, "job_postings", "description", "TEXT")
        _ensure_column(conn, "job_postings", "job_type", "TEXT")
        _ensure_column(conn, "job_postings", "salary_text", "TEXT")
        _ensure_column(conn, "job_postings", "search_query", "TEXT")
        _ensure_column(conn, "job_postings", "updated_at", "TEXT")

        conn.execute(
            """
            UPDATE job_postings
            SET updated_at = COALESCE(updated_at, created_at)
            WHERE updated_at IS NULL OR updated_at = ''
            """
        )
        conn.commit()


def save_session(job_title: str, location: str, work_style: str, k: int) -> int:
    created_at = _utcnow()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO search_sessions (job_title, location, work_style, k, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (job_title, location, work_style, k, created_at),
        )
        conn.commit()
        return cur.lastrowid


def list_sessions(limit: int = 20):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, job_title, location, work_style, k, created_at
            FROM search_sessions
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        return cur.fetchall()


def delete_session(session_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM session_jobs WHERE session_id = ?", (int(session_id),))
        conn.execute("DELETE FROM search_sessions WHERE id = ?", (int(session_id),))
        conn.commit()


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


def _normalize_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": job.get("id") or _job_id(job),
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


def save_jobs_for_session(session_id: int, jobs: list[dict]):
    now = _utcnow()
    with get_conn() as conn:
        for raw_job in jobs:
            job = _normalize_job(raw_job)
            conn.execute(
                """
                INSERT INTO job_postings (
                    id, title, company, location, url, source, description,
                    job_type, salary_text, search_query, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
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
                """,
                (
                    job["id"],
                    job["title"],
                    job["company"],
                    job["location"],
                    job["url"],
                    job["source"],
                    job["description"],
                    job["job_type"],
                    job["salary_text"],
                    job["search_query"],
                    now,
                    now,
                ),
            )
            conn.execute(
                "INSERT OR IGNORE INTO session_jobs (session_id, job_id) VALUES (?, ?)",
                (int(session_id), job["id"]),
            )
        conn.commit()


def _job_row_to_dict(row: tuple) -> dict[str, Any]:
    return {
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


def get_jobs_for_session(session_id: int):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT jp.title, jp.company, jp.location, jp.url, jp.source
            FROM session_jobs sj
            JOIN job_postings jp ON jp.id = sj.job_id
            WHERE sj.session_id = ?
            ORDER BY jp.updated_at DESC, jp.created_at DESC
            """,
            (int(session_id),),
        )
        return cur.fetchall()


def list_recent_jobs(limit: int = 200):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT
                jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                jp.description, jp.job_type, jp.salary_text, jp.search_query,
                jp.created_at, jp.updated_at,
                a.id, a.status, a.resume_id, a.notes, a.updated_at
            FROM job_postings jp
            LEFT JOIN applications a ON a.job_id = jp.id
            ORDER BY jp.updated_at DESC, jp.created_at DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        return [_job_row_to_dict(row) for row in cur.fetchall()]


def search_jobs(query: str = "", limit: int = 20, status: str | None = None):
    query_text = query.strip()
    params: list[Any] = []
    where: list[str] = []
    if query_text:
        like = f"%{query_text.lower()}%"
        where.append(
            """
            (
                lower(COALESCE(jp.title, '')) LIKE ?
                OR lower(COALESCE(jp.company, '')) LIKE ?
                OR lower(COALESCE(jp.location, '')) LIKE ?
                OR lower(COALESCE(jp.source, '')) LIKE ?
                OR lower(COALESCE(jp.description, '')) LIKE ?
            )
            """
        )
        params.extend([like, like, like, like, like])
    if status:
        where.append("COALESCE(a.status, 'saved') = ?")
        params.append(status)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.append(int(limit))

    with get_conn() as conn:
        cur = conn.execute(
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
            LIMIT ?
            """,
            params,
        )
        return [_job_row_to_dict(row) for row in cur.fetchall()]


def get_job(job_id: str):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT
                jp.id, jp.title, jp.company, jp.location, jp.url, jp.source,
                jp.description, jp.job_type, jp.salary_text, jp.search_query,
                jp.created_at, jp.updated_at,
                a.id, a.status, a.resume_id, a.notes, a.updated_at
            FROM job_postings jp
            LEFT JOIN applications a ON a.job_id = jp.id
            WHERE jp.id = ?
            LIMIT 1
            """,
            (job_id,),
        )
        row = cur.fetchone()
        return _job_row_to_dict(row) if row else None


def save_resume(filename: str, text: str) -> int:
    created_at = _utcnow()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO resumes (filename, text, created_at) VALUES (?, ?, ?)",
            (filename, text, created_at),
        )
        conn.commit()
        return cur.lastrowid


def list_resumes(limit: int = 20):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, filename, text, created_at
            FROM resumes
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        return [_resume_row_to_dict(row) for row in cur.fetchall()]


def delete_resume(resume_id: int):
    with get_conn() as conn:
        conn.execute(
            "UPDATE applications SET resume_id = NULL WHERE resume_id = ?",
            (int(resume_id),),
        )
        conn.execute(
            "UPDATE chat_threads SET resume_id = NULL WHERE resume_id = ?",
            (int(resume_id),),
        )
        conn.execute("DELETE FROM resumes WHERE id = ?", (int(resume_id),))
        conn.commit()


def get_resume(resume_id: int):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, filename, text, created_at
            FROM resumes
            WHERE id = ?
            LIMIT 1
            """,
            (int(resume_id),),
        )
        row = cur.fetchone()
        return _resume_row_to_dict(row) if row else None


def get_latest_resume():
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, filename, text, created_at
            FROM resumes
            ORDER BY id DESC
            LIMIT 1
            """
        )
        return cur.fetchone()


def upsert_application(
    job_id: str,
    resume_id: int | None = None,
    status: str = "saved",
    notes: str = "",
):
    now = _utcnow()
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT id FROM job_postings WHERE id = ? LIMIT 1",
            (job_id,),
        )
        if cur.fetchone() is None:
            raise ValueError(f"Unknown job_id: {job_id}")

        if resume_id is not None:
            cur = conn.execute(
                "SELECT id FROM resumes WHERE id = ? LIMIT 1",
                (int(resume_id),),
            )
            if cur.fetchone() is None:
                raise ValueError(f"Unknown resume_id: {resume_id}")

        conn.execute(
            """
            INSERT INTO applications (job_id, resume_id, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                resume_id = COALESCE(excluded.resume_id, applications.resume_id),
                status = excluded.status,
                notes = CASE
                    WHEN excluded.notes IS NULL OR excluded.notes = '' THEN applications.notes
                    ELSE excluded.notes
                END,
                updated_at = excluded.updated_at
            """,
            (job_id, resume_id, status, notes, now, now),
        )
        conn.commit()
    return get_application_by_job(job_id)


def get_application_by_job(job_id: str):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT
                a.id, a.job_id, a.resume_id, a.status, a.notes, a.created_at, a.updated_at,
                jp.title, jp.company, jp.url, r.filename
            FROM applications a
            JOIN job_postings jp ON jp.id = a.job_id
            LEFT JOIN resumes r ON r.id = a.resume_id
            WHERE a.job_id = ?
            LIMIT 1
            """,
            (job_id,),
        )
        row = cur.fetchone()
        return _application_row_to_dict(row) if row else None


def list_applications(status: str | None = None, limit: int = 50):
    params: list[Any] = []
    where_sql = ""
    if status:
        where_sql = "WHERE a.status = ?"
        params.append(status)
    params.append(int(limit))

    with get_conn() as conn:
        cur = conn.execute(
            f"""
            SELECT
                a.id, a.job_id, a.resume_id, a.status, a.notes, a.created_at, a.updated_at,
                jp.title, jp.company, jp.url, r.filename
            FROM applications a
            JOIN job_postings jp ON jp.id = a.job_id
            LEFT JOIN resumes r ON r.id = a.resume_id
            {where_sql}
            ORDER BY a.updated_at DESC, a.created_at DESC
            LIMIT ?
            """,
            params,
        )
        return [_application_row_to_dict(row) for row in cur.fetchall()]


def delete_application(job_id: str):
    with get_conn() as conn:
        conn.execute(
            "UPDATE chat_threads SET application_id = NULL WHERE job_id = ?",
            (job_id,),
        )
        conn.execute("DELETE FROM applications WHERE job_id = ?", (job_id,))
        conn.commit()


def create_chat_thread(
    title: str = "New chat",
    job_id: str | None = None,
    resume_id: int | None = None,
    application_id: int | None = None,
):
    now = _utcnow()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO chat_threads (
                title, job_id, resume_id, application_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (title, job_id, resume_id, application_id, now, now),
        )
        conn.commit()
        return cur.lastrowid


def update_chat_thread_title(thread_id: int, title: str):
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE chat_threads
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (title, _utcnow(), int(thread_id)),
        )
        conn.commit()


def touch_chat_thread(thread_id: int):
    with get_conn() as conn:
        conn.execute(
            "UPDATE chat_threads SET updated_at = ? WHERE id = ?",
            (_utcnow(), int(thread_id)),
        )
        conn.commit()


def list_chat_threads(limit: int = 50):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, title, job_id, resume_id, application_id, created_at, updated_at
            FROM chat_threads
            ORDER BY updated_at DESC, created_at DESC
            LIMIT ?
            """,
            (int(limit),),
        )
        rows = cur.fetchall()
        return [
            {
                "id": row[0],
                "title": row[1],
                "job_id": row[2],
                "resume_id": row[3],
                "application_id": row[4],
                "created_at": row[5],
                "updated_at": row[6],
            }
            for row in rows
        ]


def get_chat_thread(thread_id: int):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, title, job_id, resume_id, application_id, created_at, updated_at
            FROM chat_threads
            WHERE id = ?
            LIMIT 1
            """,
            (int(thread_id),),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "title": row[1],
            "job_id": row[2],
            "resume_id": row[3],
            "application_id": row[4],
            "created_at": row[5],
            "updated_at": row[6],
        }


def get_chat_messages(thread_id: int):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, role, content, created_at
            FROM chat_messages
            WHERE thread_id = ?
            ORDER BY id ASC
            """,
            (int(thread_id),),
        )
        rows = cur.fetchall()
        return [
            {
                "id": row[0],
                "role": row[1],
                "content": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]


def add_chat_message(thread_id: int, role: str, content: str):
    now = _utcnow()
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO chat_messages (thread_id, role, content, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (int(thread_id), role, content, now),
        )
        conn.execute(
            "UPDATE chat_threads SET updated_at = ? WHERE id = ?",
            (now, int(thread_id)),
        )
        conn.commit()
        return cur.lastrowid


def clear_chat_thread(thread_id: int):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM chat_messages WHERE thread_id = ?",
            (int(thread_id),),
        )
        conn.execute(
            "UPDATE chat_threads SET updated_at = ? WHERE id = ?",
            (_utcnow(), int(thread_id)),
        )
        conn.commit()


def delete_chat_thread(thread_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM chat_threads WHERE id = ?", (int(thread_id),))
        conn.commit()
