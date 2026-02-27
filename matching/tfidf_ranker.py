from __future__ import annotations

from typing import Iterable

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _safe_text(value: object) -> str:
    if value is None:
        return ""
    return str(value)


def _build_job_doc(job: dict) -> str:
    parts: Iterable[str] = (
        _safe_text(job.get("title")),
        _safe_text(job.get("company")),
        _safe_text(job.get("location")),
        _safe_text(job.get("source")),
        _safe_text(job.get("url")),
        _safe_text(job.get("description")),
    )
    return " ".join(p for p in parts if p)


def rank_jobs(resume_text: str, jobs: list[dict], top_k: int = 5):
    resume_doc = _safe_text(resume_text).strip()
    job_docs = [_build_job_doc(j) for j in jobs]

    if not resume_doc or not job_docs:
        return []

    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform([resume_doc] + job_docs)
    scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()

    ranked = sorted(zip(jobs, scores), key=lambda x: x[1], reverse=True)
    return ranked[: max(1, int(top_k))]
