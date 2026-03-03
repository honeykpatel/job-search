from __future__ import annotations

import os

from langchain_core.messages import SystemMessage
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from memory.tools import (
    get_application,
    get_job_details,
    get_resume_details,
    get_session_jobs,
    list_applications,
    list_jobs,
    list_recent_sessions,
    list_resumes,
    rank_jobs_for_resume,
    save_application,
    search_jobs,
    top_companies,
    web_search_jobs,
)


SYSTEM_PROMPT = (
    "You are a local job application assistant. "
    "You help manage saved jobs, resumes, and application tracking. "
    "You must use tools whenever the user asks about stored jobs, resumes, applications, "
    "cover letters, interview prep, follow-ups, or job-specific planning. "
    "First identify the relevant saved job and resume with tools, then answer. "
    "If the user asks to update tracking state, notes, or resume selection, you must call save_application "
    "so the application tracker stays updated in the database. "
    "When a thread already has a job and resume context, use that context by default for tracker updates. "
    "If the user asks for interview prep or a cover letter, fetch the job and relevant resume first. "
    "Use web_search_jobs only if the user explicitly asks to find new jobs online. "
    "If data is missing, say so briefly and ask for the missing job or resume only when necessary. "
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


def build_graph(thread_context: str | None = None):
    config_error = get_memory_setup_error()
    if config_error:
        raise RuntimeError(config_error)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    tools = [
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
        web_search_jobs,
    ]
    llm_with_tools = llm.bind_tools(tools)

    def agent(state: MessagesState):
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
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
