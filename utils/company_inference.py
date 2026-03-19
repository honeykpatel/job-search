from __future__ import annotations

import os
import re
from functools import lru_cache
from html import unescape
from typing import Any

from langchain_openai import ChatOpenAI


_HTML_RE = re.compile(r"<[^>]+>")
_SPACE_RE = re.compile(r"\s+")
_UNKNOWN_VALUES = {"", "unknown", "unknown company", "n/a", "none", "null"}


def _clean_text(value: str | None) -> str:
    text = unescape(str(value or ""))
    text = _HTML_RE.sub(" ", text)
    text = _SPACE_RE.sub(" ", text)
    return text.strip()


def _title_from_slug(slug: str) -> str:
    cleaned = re.sub(r"[-_]+", " ", slug or "").strip()
    if not cleaned:
        return ""
    return " ".join(part.capitalize() for part in cleaned.split())


def _heuristic_company(job: dict[str, Any]) -> str | None:
    description = _clean_text(job.get("description"))[:4000]
    source = str(job.get("source") or "")

    if ":" in source:
        _, slug = source.split(":", 1)
        guessed = _title_from_slug(slug)
        if guessed:
            return guessed

    patterns = [
        r"\bAbout\s+([A-Z][A-Za-z0-9&.,' -]{1,60})\b",
        r"\bJoin\s+([A-Z][A-Za-z0-9&.,' -]{1,60})\b",
        r"\bAt\s+([A-Z][A-Za-z0-9&.,' -]{1,60})\b",
        r"\b([A-Z][A-Za-z0-9&.,' -]{1,60})\s+is\s+(?:a|an|the)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, description)
        if match:
            candidate = match.group(1).strip(" -,:;")
            if candidate and candidate.lower() not in _UNKNOWN_VALUES:
                return candidate

    return None


@lru_cache(maxsize=256)
def _llm_extract_company(
    title: str,
    location: str,
    source: str,
    url: str,
    description: str,
) -> str | None:
    if not os.getenv("OPENAI_API_KEY"):
        return None

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = (
        "Extract the employer or company name from this job posting. "
        "Return only the company name. If you cannot determine it confidently, return UNKNOWN.\n\n"
        f"Title: {title}\n"
        f"Location: {location}\n"
        f"Source: {source}\n"
        f"URL: {url}\n"
        f"Description: {description[:6000]}"
    )
    try:
        response = llm.invoke(prompt)
    except Exception:
        return None

    text = _clean_text(getattr(response, "content", response))
    if not text:
        return None
    first_line = text.splitlines()[0].strip(" -,:;")
    if first_line.lower() in _UNKNOWN_VALUES:
        return None
    return first_line


def ensure_job_company(job: dict[str, Any]) -> dict[str, Any]:
    company = _clean_text(job.get("company"))
    if company and company.lower() not in _UNKNOWN_VALUES:
        return job

    enriched = dict(job)
    description = _clean_text(job.get("description"))
    inferred = _llm_extract_company(
        _clean_text(job.get("title")),
        _clean_text(job.get("location")),
        _clean_text(job.get("source")),
        _clean_text(job.get("url")),
        description,
    )
    if not inferred:
        inferred = _heuristic_company(job)
    if inferred:
        enriched["company"] = inferred
    return enriched

