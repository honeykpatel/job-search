from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from storage.db import list_applications, list_recent_jobs, list_resumes, list_sessions


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        return None


def _days_since(value: str | None) -> int | None:
    parsed = _parse_iso_datetime(value)
    if parsed is None:
        return None
    delta = datetime.now(UTC) - parsed
    return max(0, delta.days)


def _application_priority(item: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    status = item.get("status") or "saved"
    days_since_update = _days_since(item.get("updated_at"))
    notes = (item.get("notes") or "").strip()
    has_resume = item.get("resume_id") is not None

    if status == "offer":
        score += 95
        reasons.append("active offer")
    elif status == "interview":
        score += 80
        reasons.append("interview stage")
    elif status == "applied":
        score += 60
        reasons.append("applied and in flight")
    elif status == "saved":
        score += 40
        reasons.append("saved but not yet actioned")
    elif status in {"rejected", "archived"}:
        score += 5
        reasons.append("low priority closed state")

    if days_since_update is not None:
        if status == "applied" and days_since_update >= 14:
            score += 25
            reasons.append("follow-up overdue")
        elif status == "interview" and days_since_update >= 7:
            score += 25
            reasons.append("interview follow-up overdue")
        elif status == "saved" and days_since_update >= 5:
            score += 18
            reasons.append("saved job going stale")
        elif days_since_update >= 21 and status not in {"rejected", "archived"}:
            score += 12
            reasons.append("stale activity")

    if not has_resume and status in {"saved", "applied", "interview"}:
        score += 8
        reasons.append("resume not attached")

    if not notes and status in {"applied", "interview"}:
        score += 6
        reasons.append("missing notes")

    return score, reasons


def _follow_up_status(item: dict[str, Any]) -> dict[str, Any]:
    status = item.get("status") or "saved"
    days_since_update = _days_since(item.get("updated_at"))
    label = "ok"
    reason = ""

    if days_since_update is None:
        return {"days_since_update": None, "follow_up_status": label, "follow_up_reason": reason}

    if status == "interview" and days_since_update >= 7:
        label = "due"
        reason = "Interview-stage application has been quiet for at least 7 days."
    elif status == "applied" and days_since_update >= 14:
        label = "due"
        reason = "Applied role has been quiet for at least 14 days."
    elif status == "saved" and days_since_update >= 5:
        label = "soon"
        reason = "Saved role has not been revisited for at least 5 days."
    elif status not in {"rejected", "archived", "offer"} and days_since_update >= 21:
        label = "stale"
        reason = "Active pipeline item has gone quiet for at least 21 days."

    return {
        "days_since_update": days_since_update,
        "follow_up_status": label,
        "follow_up_reason": reason,
    }


def build_pipeline_summary() -> dict[str, Any]:
    applications = list_applications(limit=200)
    recent_jobs = list_recent_jobs(200)
    recent_sessions = list_sessions(50)
    saved_resumes = list_resumes(100)
    status_order = ["saved", "applied", "interview", "offer", "rejected", "archived"]
    status_counts = {
        status: sum(1 for item in applications if item.get("status") == status)
        for status in status_order
    }

    enriched_applications: list[dict[str, Any]] = []
    for item in applications:
        follow_up = _follow_up_status(item)
        priority_score, reasons = _application_priority(item)
        enriched_applications.append(
            {
                **item,
                **follow_up,
                "priority_score": priority_score,
                "priority_reasons": reasons,
            }
        )

    priority_queue = sorted(
        enriched_applications,
        key=lambda item: (
            -int(item.get("priority_score") or 0),
            -(int(item.get("days_since_update")) if item.get("days_since_update") is not None else -1),
            str(item.get("updated_at") or ""),
        ),
    )
    follow_up_queue = [
        item for item in priority_queue if item.get("follow_up_status") in {"due", "stale", "soon"}
    ]
    untracked_jobs = [job_item for job_item in recent_jobs if not job_item.get("application_id")]

    return {
        "tracked_applications": len(applications),
        "status_counts": status_counts,
        "saved_resumes": len(saved_resumes),
        "recent_saved_jobs": len(recent_jobs),
        "recent_sessions": len(recent_sessions),
        "follow_up_queue": follow_up_queue[:12],
        "priority_queue": priority_queue[:12],
        "recent_applications": enriched_applications[:12],
        "untracked_jobs": untracked_jobs[:12],
    }
