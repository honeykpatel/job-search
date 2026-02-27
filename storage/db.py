from datetime import datetime
import hashlib
from pathlib import Path
import sqlite3

DB_PATH = Path("jobs.db")

def get_conn():
    return sqlite3.connect(DB_PATH)

def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS search_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_title TEXT NOT NULL,
                location TEXT,
                work_style TEXT,
                k INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
        """)


        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_postings (
                id TEXT PRIMARY KEY,
                title TEXT,
                company TEXT,
                location TEXT,
                url TEXT UNIQUE,
                source TEXT,
                created_at TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS session_jobs (
                session_id INTEGER,
                job_id TEXT,
                PRIMARY KEY (session_id, job_id)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS resumes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        conn.commit()



def save_session(job_title: str, location: str, work_style: str, k: int) -> int:
    created_at = datetime.utcnow().isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO search_sessions (job_title, location, work_style, k, created_at) VALUES (?, ?, ?, ?, ?)",
            (job_title, location, work_style, k, created_at),
        )
        conn.commit()
        return cur.lastrowid

def list_sessions(limit: int = 20):
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT id, job_title, location, work_style, k, created_at FROM search_sessions ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return cur.fetchall()
    

def _job_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]

def save_jobs_for_session(session_id: int, jobs: list[dict]):
    created_at = datetime.utcnow().isoformat()
    with get_conn() as conn:
        for j in jobs:
            jid = _job_id(j["url"])
            conn.execute(
                "INSERT OR IGNORE INTO job_postings (id, title, company, location, url, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (jid, j.get("title"), j.get("company"), j.get("location"), j.get("url"), j.get("source"), created_at),
            )
            conn.execute(
                "INSERT OR IGNORE INTO session_jobs (session_id, job_id) VALUES (?, ?)",
                (session_id, jid),
            )
        conn.commit()

def get_jobs_for_session(session_id: int):
    with get_conn() as conn:
        cur = conn.execute("""
            SELECT jp.title, jp.company, jp.location, jp.url, jp.source
            FROM session_jobs sj
            JOIN job_postings jp ON jp.id = sj.job_id
            WHERE sj.session_id = ?
        """, (session_id,))
        return cur.fetchall()

def list_recent_jobs(limit: int = 200):
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT title, company, location, url, source
            FROM job_postings
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = cur.fetchall()
        return [
            {
                "title": r[0],
                "company": r[1],
                "location": r[2],
                "url": r[3],
                "source": r[4],
            }
            for r in rows
        ]

def save_resume(filename: str, text: str) -> int:
    created_at = datetime.utcnow().isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO resumes (filename, text, created_at) VALUES (?, ?, ?)",
            (filename, text, created_at),
        )
        conn.commit()
        return cur.lastrowid

def get_latest_resume():
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT id, filename, text, created_at FROM resumes ORDER BY id DESC LIMIT 1"
        )
        return cur.fetchone()
