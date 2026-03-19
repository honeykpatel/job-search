from __future__ import annotations

import os

from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from memory.tools import (
    _application_preview,
    create_helper,
    delete_helper,
    get_application,
    get_job_details,
    get_resume_details,
    get_session_jobs,
    list_helpers,
    list_applications,
    list_jobs,
    list_recent_sessions,
    list_resumes,
    rename_helper,
    rank_jobs_for_resume,
    save_application,
    search_jobs,
    top_companies,
    web_search_jobs,
)
from storage.db import get_application_by_job, get_job, get_resume, upsert_application


JOB_AGENT_PROMPT = (
    "You are a local job application assistant for one specific saved job. "
    "You are scoped to the current job, its attached resume, and its application record only. "
    "Do not inspect, compare, summarize, or reference other saved jobs or applications unless the user explicitly leaves this scope. "
    "You must use tools whenever the user asks about the current job, current resume, current application, "
    "cover letters, interview prep, follow-ups, or tracker updates for this job. "
    "If the user asks to update tracking state, notes, or resume selection, you must call the scoped application update tool "
    "so the database stays synchronized for this job. "
    "For partial tracker edits, preserve existing fields the user did not ask to change. "
    "Before any write or delete operation, you must call the relevant tool first to generate the structured preview. "
    "Do not write your own free-text confirmation message when a tool can generate the preview. "
    "After the tool returns a confirmation preview, stop and wait for the UI approval flow. "
    "Only perform the write or delete after the user clearly confirms. "
    "If the user asks for interview prep or a cover letter, fetch the current job and current resume first. "
    "Use web_search_jobs only if the user explicitly asks to find new jobs online. "
    "If data is missing, say so briefly and stay within the current job thread. "
    "Keep answers concise and structured."
)

GENERAL_AGENT_PROMPT = (
    "You are Agent, the user's general job-search strategist. "
    "You know the user's saved profile context and global pipeline context and should use them as the default background. "
    "You oversee the full job-search system across all saved jobs and tracked applications. "
    "Help with planning, prioritization, outreach strategy, interview prep, resume choices, "
    "follow-ups, stale applications, pipeline management, and navigating the saved local job-search data. "
    "Use tools whenever the user asks about stored jobs, resumes, applications, sessions, rankings, or Helper management. "
    "If the user asks to create a Helper, rename a Helper, delete a Helper, or list existing Helpers, you must use the Helper-management tools. "
    "Do not guess job ids or resume ids from free text. Resolve jobs from the database first. "
    "When creating a Helper, if the user names a job in natural language instead of giving a job_id, use the create_helper tool with job_reference. "
    "If the resume is not specified, ask the user to choose from the saved resumes returned by the tool instead of failing or inventing a value. "
    "For partial application/tracker edits, preserve existing fields the user did not ask to change. "
    "Before any write or delete operation, you must call the relevant tool first to generate the structured preview. "
    "Do not write your own free-text confirmation message when a tool can generate the preview. "
    "After the tool returns a confirmation preview, stop and wait for the UI approval flow. "
    "Only perform the write or delete after the user clearly confirms. "
    "Use web_search_jobs only if the user explicitly asks to find new jobs online. "
    "If profile data is missing, say so briefly and ask the user to save it in the Agent profile panel. "
    "When discussing priorities, reason across the whole pipeline instead of focusing on only one job unless the user asks for that. "
    "Keep answers concise and structured."
)

load_dotenv()


def get_memory_setup_error() -> str | None:
    if not os.getenv("OPENAI_API_KEY"):
        return (
            "Missing OPENAI_API_KEY. Set it in your environment or in a local .env file "
            "to enable Agent / Memory chat."
        )
    return None


def build_graph(
    thread_context: str | None = None,
    thread_type: str = "job",
    thread_job_id: str | None = None,
    thread_resume_id: int | None = None,
):
    config_error = get_memory_setup_error()
    if config_error:
        raise RuntimeError(config_error)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    general_tools = [
        list_recent_sessions,
        get_session_jobs,
        list_jobs,
        search_jobs,
        get_job_details,
        top_companies,
        list_resumes,
        get_resume_details,
        rank_jobs_for_resume,
        list_applications,
        get_application,
        save_application,
        list_helpers,
        create_helper,
        rename_helper,
        delete_helper,
        web_search_jobs,
    ]
    if thread_type == "general":
        tools = general_tools
    else:
        @tool
        def get_current_job() -> dict | None:
            """Fetch the saved job attached to this Helper thread."""
            if not thread_job_id:
                return None
            return get_job(thread_job_id)

        @tool
        def get_current_resume() -> dict | None:
            """Fetch the saved resume attached to this Helper thread."""
            if thread_resume_id is None:
                return None
            return get_resume(int(thread_resume_id))

        @tool
        def get_current_application() -> dict | None:
            """Fetch the application record for the current Helper thread."""
            if not thread_job_id:
                return None
            return get_application_by_job(thread_job_id)

        @tool
        def update_current_application(
            status: str | None = None,
            resume_id: int | None = None,
            notes: str | None = None,
            confirm: bool = False,
        ) -> dict:
            """Create or update the application record for the current Helper thread. Preview first unless confirm=true."""
            if not thread_job_id:
                raise ValueError("Current job is missing for this thread.")
            resolved_resume_id = thread_resume_id if resume_id is None else resume_id
            preview = _application_preview(
                job_id=thread_job_id,
                status=status,
                resume_id=resolved_resume_id,
                notes=notes,
                action_type="update_current_application",
            )
            if not confirm:
                return {
                    "ok": False,
                    "needs_confirmation": True,
                    "message": "This will update the current application. Ask the user for confirmation before proceeding.",
                    "preview": preview,
                }
            return upsert_application(
                job_id=thread_job_id,
                resume_id=resolved_resume_id,
                status=preview["proposed_application"]["status"],
                notes=preview["proposed_application"]["notes"],
            )

        tools = [
            get_current_job,
            get_current_resume,
            get_current_application,
            update_current_application,
            web_search_jobs,
        ]

    llm_with_tools = llm.bind_tools(tools)

    def agent(state: MessagesState):
        system_prompt = GENERAL_AGENT_PROMPT if thread_type == "general" else JOB_AGENT_PROMPT
        messages = [SystemMessage(content=system_prompt)]
        if thread_context:
            messages.append(SystemMessage(content=thread_context))
        messages += state["messages"]
        return {"messages": [llm_with_tools.invoke(messages)]}

    tool_node = ToolNode(tools)

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent)
    graph.add_node("tools", tool_node)

    graph.add_edge(START, "agent")
    graph.add_edge("tools", "agent")

    def _route(state: MessagesState):
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tools"
        return END

    graph.add_conditional_edges("agent", _route, {"tools": "tools", END: END})
    return graph.compile()
