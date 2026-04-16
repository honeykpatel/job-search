from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage


def interleave_jobs(job_lists: list[list[dict[str, Any]]], limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    lists = [list(items) for items in job_lists if items]
    while lists and len(out) < limit * max(1, len(lists)):
        next_lists = []
        for items in lists:
            if items:
                out.append(items.pop(0))
            if items:
                next_lists.append(items)
        lists = next_lists
    return out


def thread_title_from_context(job: dict[str, Any] | None, resume: dict[str, Any] | None) -> str:
    job_title = (job or {}).get("title") or "Untitled job"
    company = (job or {}).get("company") or "Unknown company"
    resume_name = (resume or {}).get("filename") or "No resume"
    return f"{job_title} @ {company} [{resume_name}]"


def build_thread_context(
    job: dict[str, Any] | None,
    resume: dict[str, Any] | None,
    profile: dict[str, Any] | None = None,
    thread_type: str = "job",
    pipeline_summary: dict[str, Any] | None = None,
    empty_general_message: str | None = None,
) -> str | None:
    profile_text = (profile or {}).get("summary_text", "").strip()

    if thread_type == "general":
        if not profile_text and not pipeline_summary:
            return empty_general_message

        lines = [
            "General profile and pipeline context for this conversation:",
            "Use this as the default background unless the user explicitly overrides it.",
        ]

        if profile_text:
            lines.extend(["Candidate profile summary:", profile_text])
        elif empty_general_message:
            lines.append(empty_general_message)

        if pipeline_summary:
            status_order = ["saved", "applied", "interview", "offer", "rejected", "archived"]
            status_counts = pipeline_summary["status_counts"]
            lines.extend(
                [
                    "Global pipeline snapshot:",
                    f"Tracked applications: {pipeline_summary['tracked_applications']}",
                    "Application status counts: "
                    + ", ".join(f"{status}={status_counts[status]}" for status in status_order),
                    f"Saved resumes: {pipeline_summary['saved_resumes']}",
                    f"Recent saved jobs: {pipeline_summary['recent_saved_jobs']}",
                    f"Recent search sessions: {pipeline_summary['recent_sessions']}",
                ]
            )

            if pipeline_summary["priority_queue"]:
                lines.append("Highest priority applications right now:")
                for item in pipeline_summary["priority_queue"][:8]:
                    notes = (item.get("notes") or "").strip().replace("\n", " ")
                    if len(notes) > 120:
                        notes = f"{notes[:117]}..."
                    resume_name = item.get("resume_filename") or "No resume attached"
                    company = item.get("company") or "Unknown company"
                    job_title = item.get("job_title") or "Untitled role"
                    status = item.get("status") or "saved"
                    updated_at = item.get("updated_at") or "unknown"
                    summary = (
                        f"- {job_title} @ {company} | status={status} | resume={resume_name} "
                        f"| priority_score={item.get('priority_score', 0)} | updated_at={updated_at}"
                    )
                    if item.get("follow_up_status") in {"due", "stale", "soon"}:
                        summary += f" | follow_up={item.get('follow_up_status')}"
                    if notes:
                        summary += f" | notes={notes}"
                    lines.append(summary)

            if pipeline_summary["follow_up_queue"]:
                lines.append("Follow-up queue:")
                for item in pipeline_summary["follow_up_queue"][:8]:
                    lines.append(
                        f"- {item.get('job_title') or 'Untitled role'} @ {item.get('company') or 'Unknown company'} "
                        f"| status={item.get('status') or 'saved'} | follow_up={item.get('follow_up_status')} "
                        f"| days_since_update={item.get('days_since_update')}"
                    )

            if pipeline_summary["untracked_jobs"]:
                lines.append("Recent saved jobs without application tracking yet:")
                for item in pipeline_summary["untracked_jobs"][:8]:
                    lines.append(
                        f"- {item.get('title') or 'Untitled role'} @ {item.get('company') or 'Unknown company'} "
                        f"| source={item.get('source') or 'Unknown'} | location={item.get('location') or 'Unknown'}"
                    )

        return "\n".join(lines)

    if not job and not resume and not profile_text:
        return None

    lines = [
        "Thread context for this conversation:",
        "Use this job and resume as the default context unless the user explicitly switches.",
    ]
    if job:
        lines.extend(
            [
                f"Job title: {job.get('title') or 'Unknown'}",
                f"Company: {job.get('company') or 'Unknown'}",
                f"Location: {job.get('location') or 'Unknown'}",
                f"Source: {job.get('source') or 'Unknown'}",
                f"URL: {job.get('url') or 'Unknown'}",
                f"Job description: {job.get('description') or 'Unavailable'}",
                f"Application status: {job.get('application_status') or 'not_tracked'}",
                f"Application notes: {job.get('application_notes') or ''}",
            ]
        )
    if resume:
        lines.extend(
            [
                f"Resume filename: {resume.get('filename') or 'Unknown'}",
                f"Resume text: {resume.get('text') or ''}",
            ]
        )
    if profile_text:
        lines.extend(["Candidate profile summary:", profile_text])
    return "\n".join(lines)


def build_langchain_messages(history: list[dict[str, Any]]) -> list[Any]:
    messages: list[Any] = []
    for message in history:
        if message["role"] == "user":
            messages.append(HumanMessage(content=message["content"]))
        elif message["role"] == "assistant":
            messages.append(AIMessage(content=message["content"]))
        elif message["role"] == "tool":
            messages.append(
                SystemMessage(
                    content=f"Previous tool result for conversation continuity:\n{message['content']}"
                )
            )
    return messages
