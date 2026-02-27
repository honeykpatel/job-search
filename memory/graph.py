from __future__ import annotations

from langchain_core.messages import SystemMessage
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from memory.tools import (
    get_latest_resume,
    get_session_jobs,
    list_recent_sessions,
    rank_jobs_for_resume,
    top_companies,
    web_search_jobs,
)


SYSTEM_PROMPT = (
    "You are a local job-search memory assistant. "
    "You must use tools to answer any questions about saved sessions, jobs, or resumes. "
    "Available tools: list_recent_sessions, get_session_jobs, top_companies, "
    "get_latest_resume, rank_jobs_for_resume, web_search_jobs. "
    "Use web_search_jobs only if the user explicitly asks to find new jobs online. "
    "If data is missing, say so briefly. Keep answers short and structured."
)

load_dotenv()


def build_graph():
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    tools = [
        list_recent_sessions,
        get_session_jobs,
        top_companies,
        get_latest_resume,
        rank_jobs_for_resume,
        web_search_jobs,
    ]
    llm_with_tools = llm.bind_tools(tools)

    def agent(state: MessagesState):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
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
