from pathlib import Path
import os
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import streamlit as st
from app.conversation import (
    build_langchain_messages,
    build_thread_context,
    interleave_jobs,
    thread_title_from_context,
)
from storage.db import init_db, save_session, list_sessions
from storage.db import delete_session, save_jobs_for_session, get_jobs_for_session
from collectors.api_adzuna import search_adzuna
from utils.dedupe import dedupe_jobs
from storage.db import (
    add_chat_message,
    clear_chat_thread,
    create_chat_thread,
    delete_application,
    delete_chat_thread,
    delete_resume,
    get_chat_thread,
    get_job,
    get_resume,
    list_applications as db_list_applications,
    list_chat_threads,
    list_recent_jobs,
    list_resumes as db_list_resumes,
    get_chat_messages,
    save_resume,
    search_jobs as db_search_jobs,
    get_latest_resume,
    get_or_create_general_thread,
    get_user_profile,
    save_user_profile,
    touch_chat_thread,
    upsert_application,
)
from parsing.resume_text import extract_text
from matching.tfidf_ranker import rank_jobs
from memory.graph import build_graph, get_memory_setup_error

init_db()  # Ensure the database is initialized


def _sidebar_thread_label(thread: dict) -> str:
    title = (thread.get("title") or "Untitled chat").strip()
    return title if len(title) <= 42 else f"{title[:39]}..."


def _thread_kind_label(thread: dict) -> str:
    return "Deep Agent" if thread.get("thread_type") == "general" else "Job Agent"


@st.dialog("New Agent Chat")
def _new_chat_dialog():
    resumes = db_list_resumes(100)
    if not resumes:
        st.info("Save at least one resume first, then create a chat.")
        return

    resume_labels = [
        f"{resume['id']} | {resume['filename']} | {resume['created_at'][:10]}"
        for resume in resumes
    ]
    selected_resume_label = st.selectbox(
        "Resume",
        resume_labels,
        key="dialog_new_chat_resume",
    )
    selected_resume = resumes[resume_labels.index(selected_resume_label)]

    matched_jobs = [
        job
        for job, _score in rank_jobs(
            selected_resume["text"],
            list_recent_jobs(300),
            top_k=25,
        )
    ]

    if not matched_jobs:
        st.info("No saved jobs are available to match against that resume yet.")
        return

    job_labels = [
        (
            f"{job.get('title') or 'Untitled'} | "
            f"{job.get('company') or 'Unknown'}"
        )
        for job in matched_jobs
    ]
    selected_job_label = st.selectbox(
        "Matched job",
        job_labels,
        key="dialog_new_chat_job",
    )
    selected_job = matched_jobs[job_labels.index(selected_job_label)]

    st.markdown(
        f"""
        <div class="memory-context-strip">
          <span class="memory-context-label">New chat</span>
          <span class="pill">{selected_job.get('title') or 'Untitled'}</span>
          <span class="pill">{selected_job.get('company') or 'Unknown'}</span>
          <span class="pill">{selected_job.get('location') or 'Unknown'}</span>
          <span class="pill">{selected_resume.get('filename') or 'No resume'}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Open chat", key="dialog_open_chat", type="primary", use_container_width=True):
        thread_id = create_chat_thread(
            title=thread_title_from_context(selected_job, selected_resume),
            thread_type="job",
            job_id=selected_job["id"],
            resume_id=selected_resume["id"],
        )
        st.session_state["selected_thread_id"] = thread_id
        st.rerun()

st.set_page_config(page_title="Job Pilot", layout="wide")

st.markdown(
    """
    <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Serif+Display&display=swap");
    :root {
        --ink: #132235;
        --muted: #5b6a7a;
        --accent: #0ea5a3;
        --accent-2: #f59e0b;
        --bg: #f3f7fb;
        --bg-soft: #fbfdff;
        --panel: #f5f7fb;
        --panel-2: #eef2f7;
        --stroke: #d9e2ec;
        --shadow: 0 8px 20px rgba(16, 24, 40, 0.08);
    }
    html, body, [class*="css"]  {
        font-family: "Space Grotesk", system-ui, -apple-system, sans-serif;
        color: var(--ink);
    }
    html, body, .stApp, [data-testid="stAppViewContainer"], [data-testid="stMain"] {
        background: linear-gradient(180deg, var(--bg) 0%, #ffffff 38%, var(--bg-soft) 100%);
        color: var(--ink);
    }
    [data-testid="stAppViewContainer"] > .main,
    [data-testid="stMainBlockContainer"] {
        background: transparent;
        color: var(--ink);
    }
    p, span, label, li, div, .stMarkdown, .stText, .stAlert, .stRadio, .stSelectbox label,
    .stTextInput label, .stNumberInput label, .stSlider label, .stCheckbox label {
        color: var(--ink);
    }
    [data-testid="stHeader"] {
        background: rgba(243, 247, 251, 0.82);
        backdrop-filter: blur(10px);
    }
    h1, h2, h3, .stTitle {
        font-family: "DM Serif Display", serif;
        letter-spacing: 0.2px;
        color: var(--ink);
    }
    [data-testid="stToolbar"] {
        color: var(--ink);
    }
    .app-hero {
        background: radial-gradient(1200px 400px at 10% -10%, #b3e5ff 0%, transparent 60%),
                    radial-gradient(900px 300px at 90% -10%, #ffd6a7 0%, transparent 55%),
                    linear-gradient(180deg, #f7f9fc 0%, #ffffff 100%);
        border: 1px solid var(--stroke);
        padding: 18px 22px;
        border-radius: 18px;
    }
    .app-hero .title {
        font-size: 36px;
        margin: 0 0 6px 0;
    }
    .app-hero .subtitle {
        color: var(--muted);
        margin: 0;
    }
    section[data-testid="stSidebar"] > div:first-child {
        background: var(--panel);
        border-right: 1px solid var(--stroke);
    }
    section[data-testid="stSidebar"] * {
        color: var(--ink);
    }
    section[data-testid="stSidebar"] > div:first-child > div[data-testid="stVerticalBlock"] > div[data-testid="stVerticalBlock"]:first-child {
        position: sticky;
        top: 0;
        z-index: 20;
        background: var(--panel);
        padding-top: 0.5rem;
        padding-bottom: 0.75rem;
    }
    section[data-testid="stSidebar"] > div:first-child > div[data-testid="stVerticalBlock"] > div[data-testid="stVerticalBlock"]:nth-child(2) {
        max-height: calc(100vh - 12rem);
        overflow-y: auto;
        padding-right: 0.2rem;
    }
    .stTabs [role="tablist"] {
        gap: 8px;
        padding: 6px;
        background: var(--panel-2);
        border-radius: 14px;
    }
    .stTabs [role="tab"] {
        padding: 10px 16px;
        border-radius: 12px;
        border: 1px solid transparent;
        font-weight: 600;
        color: var(--ink);
        background: transparent;
    }
    .stTabs [aria-selected="true"] {
        background: white;
        border-color: var(--stroke);
        box-shadow: 0 4px 16px rgba(16, 24, 40, 0.06);
    }
    .stTabs [data-baseweb="tab-highlight"] {
        background: var(--accent);
    }
    .stButton button, .stLinkButton a {
        border-radius: 12px !important;
        border: 1px solid var(--stroke) !important;
        background: white !important;
        color: var(--ink) !important;
    }
    .stButton button[kind="primary"] {
        background: linear-gradient(135deg, var(--accent), #22c1c3) !important;
        color: white !important;
        border: none !important;
    }
    .stTextInput input,
    .stTextArea textarea,
    .stSelectbox [data-baseweb="select"] > div,
    .stMultiSelect [data-baseweb="select"] > div,
    .stNumberInput input,
    [data-testid="stFileUploader"] section,
    [data-testid="stChatInput"] textarea {
        background: #ffffff !important;
        color: var(--ink) !important;
        border: 1px solid var(--stroke) !important;
    }
    .stTextInput input::placeholder,
    .stTextArea textarea::placeholder {
        color: var(--muted) !important;
    }
    [data-baseweb="select"] * {
        color: var(--ink) !important;
    }
    [data-testid="stExpander"] {
        border: 1px solid var(--stroke);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.92);
    }
    [data-testid="stExpander"] details summary,
    [data-testid="stExpander"] details summary * {
        color: var(--ink) !important;
    }
    [data-testid="stMetric"], [data-testid="stChatMessage"] {
        color: var(--ink);
    }
    [data-testid="stChatMessage"] {
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid var(--stroke);
        border-radius: 14px;
        padding: 0.35rem 0.75rem;
    }
    [data-testid="stCodeBlock"] {
        border-radius: 12px;
    }
    .stCaption {
        color: var(--muted);
    }
    .card {
        border: 1px solid var(--stroke);
        background: white;
        border-radius: 16px;
        padding: 14px 16px;
        box-shadow: var(--shadow);
        margin-bottom: 10px;
    }
    .chat-shell {
        border: 1px solid var(--stroke);
        background: white;
        border-radius: 16px;
        padding: 12px;
        box-shadow: var(--shadow);
        max-height: 60vh;
        overflow-y: auto;
    }
    .chat-hint {
        background: #f8fafc;
        border: 1px dashed var(--stroke);
        border-radius: 12px;
        padding: 10px 12px;
        color: var(--muted);
        margin-bottom: 10px;
    }
    [data-testid="stChatInput"] {
        position: sticky;
        bottom: 0;
        background: white;
        border-top: 1px solid var(--stroke);
        padding-top: 8px;
        margin-top: 8px;
        z-index: 5;
    }
    .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        color: #0f172a;
        background: #e2e8f0;
        margin-right: 6px;
    }
    .kpi {
        border: 1px solid var(--stroke);
        background: white;
        border-radius: 16px;
        padding: 12px 14px;
        box-shadow: var(--shadow);
    }
    .kpi .label { color: var(--muted); font-size: 12px; }
    .kpi .value { font-size: 20px; font-weight: 700; }
    .section-title { margin-top: 6px; }
    .memory-context-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        border: 1px solid var(--stroke);
        background: rgba(255, 255, 255, 0.92);
        border-radius: 14px;
        padding: 10px 12px;
        box-shadow: var(--shadow);
        margin-bottom: 10px;
    }
    .memory-context-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
    }
    .agent-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 14px;
        margin-bottom: 8px;
    }
    .agent-header-title {
        font-family: "DM Serif Display", serif;
        font-size: 30px;
        line-height: 1;
        margin: 0;
    }
    .agent-header-copy {
        color: var(--muted);
        font-size: 13px;
        margin: 0;
    }
    .agent-chat-shell {
        min-height: 62vh;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

if st.session_state.get("_flash_success"):
    st.success(st.session_state.pop("_flash_success"))

pages = [
    "Job Search",
    "Resume",
    "Matching",
    "Applications",
    "Agent",
]

job_title = ""
location = ""
work_style = "Any"
k = 5
do_search = False
selected_thread_id = None
show_tool_debug = False

with st.sidebar:
    workspace_sidebar = st.container()
    chats_sidebar = st.container()

    if "active_page" not in st.session_state:
        st.session_state["active_page"] = pages[0]

    with workspace_sidebar:
        st.header("Workspace")
        for page in pages:
            is_active_page = st.session_state["active_page"] == page
            if st.button(
                page,
                key=f"workspace_nav_{page}",
                use_container_width=True,
                type="primary" if is_active_page else "secondary",
            ):
                st.session_state["active_page"] = page
                st.rerun()
        active_page = st.session_state["active_page"]

    if "selected_session_id" not in st.session_state:
        st.session_state["selected_session_id"] = None
    if "selected_thread_id" not in st.session_state:
        st.session_state["selected_thread_id"] = None

    if active_page == "Agent":
        with chats_sidebar:
            st.divider()
            st.subheader("Agents")
            selected_thread_id = st.session_state["selected_thread_id"]
            if st.button("Open Deep Agent", key="sidebar_general_chat", use_container_width=True, type="primary"):
                st.session_state["selected_thread_id"] = get_or_create_general_thread()
                st.rerun()
            if st.button("New Job Agent", key="sidebar_new_chat", use_container_width=True):
                _new_chat_dialog()
            threads = list_chat_threads(100)
            if not threads:
                st.caption("No chats yet.")
            general_threads = [t for t in threads if t.get("thread_type") == "general"]
            job_threads = [t for t in threads if t.get("thread_type") != "general"]
            if general_threads:
                st.caption("Deep Agent")
            for thread in general_threads:
                is_active = st.session_state["selected_thread_id"] == thread["id"]
                if st.button(
                    _sidebar_thread_label(thread),
                    key=f"thread_nav_{thread['id']}",
                    use_container_width=True,
                    type="primary" if is_active else "secondary",
                ):
                    st.session_state["selected_thread_id"] = thread["id"]
                    selected_thread_id = thread["id"]
            if job_threads:
                st.caption("Job Agents")
            for thread in job_threads:
                is_active = st.session_state["selected_thread_id"] == thread["id"]
                thread_cols = st.columns([5, 1])
                with thread_cols[0]:
                    if st.button(
                        _sidebar_thread_label(thread),
                        key=f"thread_nav_{thread['id']}",
                        use_container_width=True,
                        type="primary" if is_active else "secondary",
                    ):
                        st.session_state["selected_thread_id"] = thread["id"]
                        selected_thread_id = thread["id"]
                with thread_cols[1]:
                    if st.button("x", key=f"thread_delete_{thread['id']}", use_container_width=True):
                        delete_chat_thread(thread["id"])
                        if st.session_state["selected_thread_id"] == thread["id"]:
                            st.session_state["selected_thread_id"] = None
                        st.rerun()
            show_tool_debug = st.checkbox("Show tools", key="memory_show_tool_debug")
    elif active_page == "Job Search":
        with chats_sidebar:
            st.divider()
            st.subheader("Saved Sessions")
            rows = list_sessions(100)
            if not rows:
                st.caption("No saved sessions yet.")
            for row in rows:
                session_id = row[0]
                label = f"{row[1]} ({row[5][:10]})"
                is_active = st.session_state["selected_session_id"] == session_id
                session_cols = st.columns([5, 1])
                with session_cols[0]:
                    if st.button(
                        label if len(label) <= 42 else f"{label[:39]}...",
                        key=f"session_nav_{session_id}",
                        use_container_width=True,
                        type="primary" if is_active else "secondary",
                    ):
                        st.session_state["selected_session_id"] = session_id
                with session_cols[1]:
                    if st.button("x", key=f"session_delete_{session_id}", use_container_width=True):
                        deleted = delete_session(session_id)
                        if st.session_state["selected_session_id"] == session_id:
                            st.session_state["selected_session_id"] = None
                        if (
                            st.session_state["selected_thread_id"]
                            in deleted["deleted_thread_ids"]
                        ):
                            st.session_state["selected_thread_id"] = None
                        st.rerun()
    elif active_page == "Resume":
        with chats_sidebar:
            st.divider()
            st.subheader("Saved Resumes")
            resumes = db_list_resumes(100)
            if "selected_resume_id" not in st.session_state:
                st.session_state["selected_resume_id"] = None
            if not resumes:
                st.caption("No saved resumes yet.")
            for resume in resumes:
                resume_id = resume["id"]
                label = f"{resume['filename']} ({resume['created_at'][:10]})"
                is_active = st.session_state["selected_resume_id"] == resume_id
                resume_cols = st.columns([5, 1])
                with resume_cols[0]:
                    if st.button(
                        label if len(label) <= 42 else f"{label[:39]}...",
                        key=f"resume_nav_{resume_id}",
                        use_container_width=True,
                        type="primary" if is_active else "secondary",
                    ):
                        st.session_state["selected_resume_id"] = resume_id
                with resume_cols[1]:
                    if st.button("x", key=f"resume_delete_{resume_id}", use_container_width=True):
                        delete_resume(resume_id)
                        if st.session_state["selected_resume_id"] == resume_id:
                            st.session_state["selected_resume_id"] = None
                        st.rerun()
    elif active_page == "Applications":
        with chats_sidebar:
            st.divider()
            st.subheader("Tracked Applications")
            applications = db_list_applications(limit=200)
            if "selected_application_job_id" not in st.session_state:
                st.session_state["selected_application_job_id"] = None
            if not applications:
                st.caption("No tracked applications yet.")
            for item in applications:
                job_id = item["job_id"]
                label = f"{item.get('job_title') or 'Untitled'} ({item.get('status') or 'saved'})"
                is_active = st.session_state["selected_application_job_id"] == job_id
                application_cols = st.columns([5, 1])
                with application_cols[0]:
                    if st.button(
                        label if len(label) <= 42 else f"{label[:39]}...",
                        key=f"application_nav_{job_id}",
                        use_container_width=True,
                        type="primary" if is_active else "secondary",
                    ):
                        st.session_state["selected_application_job_id"] = job_id
                with application_cols[1]:
                    if st.button("x", key=f"application_delete_{job_id}", use_container_width=True):
                        delete_application(job_id)
                        if st.session_state["selected_application_job_id"] == job_id:
                            st.session_state["selected_application_job_id"] = None
                        st.rerun()
    else:
        st.session_state["selected_thread_id"] = None

if active_page == "Job Search":
    st.write("### Search")
    st.caption("Search, save, and reopen sessions from the main workspace.")

    filter_cols = st.columns([2, 2, 1, 1])
    with filter_cols[0]:
        job_title = st.text_input(
            "Job Title",
            placeholder="e.g., Data Analyst",
            key="search_job_title",
        )
    with filter_cols[1]:
        location = st.text_input(
            "Location (optional)",
            placeholder="e.g., Indianapolis, IN",
            key="search_location",
        )
    with filter_cols[2]:
        work_style = st.selectbox(
            "Work Style",
            ["Any", "Remote", "Hybrid", "Onsite"],
            key="search_work_style",
        )
    with filter_cols[3]:
        k = st.slider("Results", 1, 20, 5, key="search_k")

    action_cols = st.columns([1, 1, 3])
    with action_cols[0]:
        do_search = st.button("Search for Jobs", key="search_submit")
    with action_cols[1]:
        if st.button("Save this search", key="save_search"):
            if not job_title.strip():
                st.warning("Job Title is required to save a session.")
            else:
                sid = save_session(job_title.strip(), location.strip(), work_style, int(k))
                st.session_state["_flash_success"] = f"Saved session #{sid}"
                st.rerun()

    if do_search:
        if not job_title.strip():
            st.warning("Please enter a Job Title to perform a search.")
        else:
            jobs_adzuna = search_adzuna(job_title.strip(), location.strip(), work_style, int(k))
            jobs = interleave_jobs([jobs_adzuna], int(k))
            jobs = dedupe_jobs(jobs)[: int(k)]
            sid = save_session(job_title.strip(), location.strip(), work_style, int(k))
            save_jobs_for_session(sid, jobs)
            st.success(f"Saved session #{sid} with {len(jobs)} jobs")
            st.write(f"### Search results for '{job_title.strip()}'")
            if jobs:
                for j in jobs:
                    st.markdown(
                        f"""
                        <div class="card">
                          <div><strong>{j.get('title') or 'Untitled'}</strong></div>
                          <div class="pill">{j.get('company') or 'Unknown'}</div>
                          <div class="pill">{j.get('location') or 'Unknown'}</div>
                          <div class="pill">{j.get('source') or 'Unknown'}</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                    if j.get("url"):
                        st.link_button("Open posting", j["url"])

    sid = st.session_state.get("selected_session_id")
    if sid:
        with st.expander(f"Saved Session #{sid} jobs", expanded=True):
            saved_jobs = get_jobs_for_session(sid)
            for (title, company, loc, url, source) in saved_jobs:
                st.markdown(
                    f"""
                    <div class="card">
                      <div><strong>{title or 'Untitled'}</strong></div>
                      <div class="pill">{company or 'Unknown'}</div>
                      <div class="pill">{loc or 'Unknown'}</div>
                      <div class="pill">{source or 'Unknown'}</div>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                st.link_button("Open posting", url)

if active_page == "Resume":
    st.write("### Upload your resume (PDF or DOCX)")
    st.caption("Tip: Save a resume once, then use Matching or Agent tabs.")
    if "selected_resume_id" not in st.session_state:
        st.session_state["selected_resume_id"] = None
    up = st.file_uploader("Resume", type=["pdf", "docx"])

    if up and st.button("Save Resume"):
        text = extract_text(up)
        rid = save_resume(up.name, text)
        st.session_state["selected_resume_id"] = rid
        st.session_state["_flash_success"] = f"Saved resume #{rid}"
        st.rerun()
        st.text_area("Extracted text (preview)", text[:4000], height=250)

    selected_resume = None
    if st.session_state["selected_resume_id"] is not None:
        selected_resume = get_resume(st.session_state["selected_resume_id"])

    if selected_resume:
        st.write(
            f"**Selected resume:** #{selected_resume['id']} - {selected_resume['filename']} - {selected_resume['created_at']}"
        )
        st.text_area(
            "Saved resume text",
            selected_resume["text"][:6000],
            height=320,
            disabled=True,
            key=f"resume_view_{selected_resume['id']}",
        )
    else:
        latest = get_latest_resume()
        if latest:
            st.write(f"**Latest resume:** #{latest[0]} - {latest[1]} - {latest[3]}")


if active_page == "Matching":
    st.write("### Top Matches")
    st.caption("Ranks recent saved jobs against your latest resume using TF-IDF.")
    latest = get_latest_resume()
    if not latest:
        st.warning("No resume found. Upload and save a resume first.")
    else:
        st.write(f"**Latest resume:** #{latest[0]} - {latest[1]} - {latest[3]}")

    top_k = st.slider("Top matches", 1, 20, 5)
    show_debug = st.toggle("Show debug text for top match")
    if st.button("Find Top Matches"):
        jobs = list_recent_jobs(200)
        if not jobs:
            st.warning("No saved jobs found.")
        elif not latest:
            st.warning("No resume found. Upload and save a resume first.")
        else:
            ranked = rank_jobs(latest[2], jobs, top_k=top_k)
            if not ranked:
                st.warning("No matches found.")
            else:
                for job, score in ranked:
                    company = job.get("company") or "Unknown"
                    location = job.get("location") or "Unknown"
                    source = job.get("source") or "Unknown"
                    st.markdown(
                        f"""
                        <div class="card">
                          <div><strong>{job.get('title') or 'Untitled'}</strong></div>
                          <div class="pill">{company}</div>
                          <div class="pill">{location}</div>
                          <div class="pill">{source}</div>
                          <div style="margin-top:6px;"><strong>Similarity:</strong> {score:.3f}</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                    if job.get("url"):
                        st.link_button("Open posting", job["url"])

                if show_debug and ranked:
                    top_job = ranked[0][0]
                    job_text = " ".join(
                        [
                            str(top_job.get("title") or ""),
                            str(top_job.get("company") or ""),
                            str(top_job.get("location") or ""),
                            str(top_job.get("source") or ""),
                            str(top_job.get("url") or ""),
                            str(top_job.get("description") or ""),
                        ]
                    ).strip()
                    st.write("### Debug: Matching Text (Top 1)")
                    st.text_area(
                        "Resume text (preview)",
                        (latest[2] or "")[:1500],
                        height=200,
                    )
                    st.text_area(
                        "Job text (preview)",
                        job_text[:1500],
                        height=200,
                    )

if active_page == "Applications":
    st.write("### Applications")
    st.caption("This is the application tracker. Changes here are stored in the database and can also be updated by the Agent.")
    if "selected_application_job_id" not in st.session_state:
        st.session_state["selected_application_job_id"] = None

    all_applications = db_list_applications(limit=200)
    app_cols = st.columns(4)
    status_counts = {
        "Tracked": len(all_applications),
        "Applied": sum(1 for item in all_applications if item["status"] == "applied"),
        "Interview": sum(1 for item in all_applications if item["status"] == "interview"),
        "Offer": sum(1 for item in all_applications if item["status"] == "offer"),
    }
    for col, (label, value) in zip(app_cols, status_counts.items()):
        with col:
            st.markdown(
                f'<div class="kpi"><div class="label">{label}</div><div class="value">{value}</div></div>',
                unsafe_allow_html=True,
            )

    filter_cols = st.columns([2, 1, 1])
    with filter_cols[0]:
        application_query = st.text_input(
            "Search saved jobs",
            placeholder="Title, company, location, keyword...",
            key="applications_query",
        )
    with filter_cols[1]:
        status_filter = st.selectbox(
            "Status filter",
            ["All", "saved", "applied", "interview", "offer", "rejected", "archived"],
            key="applications_status_filter",
        )
    with filter_cols[2]:
        application_limit = st.slider(
            "Jobs shown",
            5,
            100,
            20,
            key="applications_limit",
        )

    jobs = db_search_jobs(
        query=application_query,
        limit=int(application_limit),
        status=None if status_filter == "All" else status_filter,
    )

    if not jobs:
        st.info("No saved jobs match the current filters.")
    else:
        labels = []
        selected_index = 0
        for job in jobs:
            company = job.get("company") or "Unknown company"
            status = job.get("application_status") or "saved"
            labels.append(
                f"{job.get('title') or 'Untitled'} | {company} | {status}"
            )
        for idx, job in enumerate(jobs):
            if job["id"] == st.session_state["selected_application_job_id"]:
                selected_index = idx
                break

        selected_job_label = st.selectbox(
            "Select a saved job",
            labels,
            key="applications_selected_job",
            index=selected_index,
        )
        selected_job = jobs[labels.index(selected_job_label)]
        st.session_state["selected_application_job_id"] = selected_job["id"]

        st.markdown(
            f"""
            <div class="card">
              <div><strong>{selected_job.get('title') or 'Untitled'}</strong></div>
              <div class="pill">{selected_job.get('company') or 'Unknown'}</div>
              <div class="pill">{selected_job.get('location') or 'Unknown'}</div>
              <div class="pill">{selected_job.get('source') or 'Unknown'}</div>
              <div class="pill">{selected_job.get('application_status') or 'not tracked'}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if selected_job.get("url"):
            st.link_button("Open posting", selected_job["url"])
        if selected_job.get("description"):
            st.text_area(
                "Job description",
                selected_job["description"][:6000],
                height=220,
                disabled=True,
                key=f"job_description_{selected_job['id']}",
            )

        resumes = db_list_resumes(100)
        resume_label_to_id = {"(none)": None}
        for resume in resumes:
            resume_label_to_id[
                f"{resume['id']} | {resume['filename']} | {resume['created_at'][:10]}"
            ] = resume["id"]

        current_resume_id = selected_job.get("resume_id")
        current_resume_label = "(none)"
        for label, resume_id in resume_label_to_id.items():
            if resume_id == current_resume_id:
                current_resume_label = label
                break

        form_cols = st.columns(2)
        with form_cols[0]:
            selected_status = st.selectbox(
                "Application status",
                ["saved", "applied", "interview", "offer", "rejected", "archived"],
                index=[
                    "saved",
                    "applied",
                    "interview",
                    "offer",
                    "rejected",
                    "archived",
                ].index(selected_job.get("application_status") or "saved"),
                key=f"application_status_{selected_job['id']}",
            )
        with form_cols[1]:
            selected_resume_label = st.selectbox(
                "Attached resume",
                list(resume_label_to_id.keys()),
                index=list(resume_label_to_id.keys()).index(current_resume_label),
                key=f"application_resume_{selected_job['id']}",
            )

        application_notes = st.text_area(
            "Notes",
            value=selected_job.get("application_notes") or "",
            height=180,
            key=f"application_notes_{selected_job['id']}",
            placeholder="Interview prep notes, recruiter details, follow-up plan, cover letter points...",
        )

        action_label = (
            "Update tracker"
            if selected_job.get("application_id")
            else "Start tracking this application"
        )
        if st.button(action_label, key=f"save_application_{selected_job['id']}"):
            updated = upsert_application(
                job_id=selected_job["id"],
                resume_id=resume_label_to_id[selected_resume_label],
                status=selected_status,
                notes=application_notes,
            )
            st.success(
                f"Tracker updated for {updated['job_title']} with status '{updated['status']}'."
            )

if active_page == "Agent":
    memory_setup_error = get_memory_setup_error()
    if memory_setup_error:
        st.warning(memory_setup_error)

    selected_thread = get_chat_thread(selected_thread_id) if selected_thread_id else None
    selected_thread_type = (
        selected_thread.get("thread_type", "job") if selected_thread else None
    )
    selected_thread_job = (
        get_job(selected_thread["job_id"])
        if selected_thread and selected_thread.get("job_id")
        else None
    )
    selected_thread_resume = (
        get_resume(selected_thread["resume_id"])
        if selected_thread and selected_thread.get("resume_id")
        else None
    )
    user_profile = get_user_profile()

    agent_title = _thread_kind_label(selected_thread) if selected_thread else "Agent"
    agent_copy = (
        "General strategy chat with your saved profile as default context."
        if selected_thread_type == "general"
        else "Focused subagent chat for one job and resume."
    )
    st.markdown(
        f"""
        <div class="agent-header">
          <div class="agent-header-title">{agent_title}</div>
          <p class="agent-header-copy">{agent_copy}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if selected_thread:
        if selected_thread_type == "general":
            profile_status = "Profile saved" if (user_profile or {}).get("summary_text", "").strip() else "Profile empty"
            st.markdown(
                f"""
                <div class="memory-context-strip">
                  <span class="memory-context-label">Active agent</span>
                  <div class="pill">Deep Agent</div>
                  <div class="pill">{profile_status}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            profile_value = (user_profile or {}).get("summary_text", "")
            edited_profile = st.text_area(
                "Deep Agent profile",
                value=profile_value,
                height=180,
                help="Store your background, target roles, strengths, constraints, location preferences, compensation goals, and outreach style.",
                key="deep_agent_profile_text",
            )
            if st.button("Save profile", key="save_deep_agent_profile"):
                save_user_profile(edited_profile)
                st.session_state["_flash_success"] = "Deep Agent profile saved."
                st.rerun()
        else:
            st.markdown(
                f"""
                <div class="memory-context-strip">
                  <span class="memory-context-label">Active agent</span>
                  <div class="pill">Job Agent</div>
                  <div class="pill">{selected_thread_job.get('title') if selected_thread_job else 'No job selected'}</div>
                  <div class="pill">{selected_thread_job.get('company') if selected_thread_job else 'No company selected'}</div>
                  <div class="pill">{selected_thread_job.get('location') if selected_thread_job else 'No location'}</div>
                  <div class="pill">{selected_thread_job.get('source') if selected_thread_job else 'No source'}</div>
                  <div class="pill">{selected_thread_resume.get('filename') if selected_thread_resume else 'No resume selected'}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        empty_cols = st.columns([2, 1, 2])
        with empty_cols[1]:
            if st.button("Open Deep Agent", key="agent_empty_general_chat", type="primary", use_container_width=True):
                st.session_state["selected_thread_id"] = get_or_create_general_thread()
                st.rerun()
            if st.button("New Job Agent", key="agent_empty_new_chat", use_container_width=True):
                _new_chat_dialog()

    if selected_thread_id is not None:
        control_cols = st.columns([1, 4])
        with control_cols[0]:
            if st.button("Clear thread", key="memory_clear_chat", disabled=selected_thread_id is None):
                clear_chat_thread(selected_thread_id)
                touch_chat_thread(selected_thread_id)
                st.rerun()
        with control_cols[1]:
            hint = (
                'Try: "Summarize my search strategy" or "What should I prioritize this week?"'
                if selected_thread_type == "general"
                else 'Try: "Draft a follow-up for this role" or "What are the gaps against this job?"'
            )
            st.markdown(
                f'<div class="chat-hint">{hint}</div>',
                unsafe_allow_html=True,
            )

    def _handle_memory_submit():
        prompt = st.session_state.get("memory_input", "").strip()
        if prompt:
            st.session_state["_memory_pending"] = prompt
        st.session_state["memory_input"] = ""

    pending = st.session_state.pop("_memory_pending", None)
    if pending:
        if selected_thread_id is None:
            st.warning("Open Deep Agent or create a Job Agent first.")
            st.stop()

        add_chat_message(selected_thread_id, "user", pending)
        existing_messages = get_chat_messages(selected_thread_id)
        thread = get_chat_thread(selected_thread_id)
        thread_type = thread.get("thread_type", "job") if thread else "job"
        thread_job = get_job(thread["job_id"]) if thread and thread.get("job_id") else None
        thread_resume = get_resume(thread["resume_id"]) if thread and thread.get("resume_id") else None
        thread_profile = get_user_profile()
        thread_context = build_thread_context(
            thread_job,
            thread_resume,
            profile=thread_profile,
            thread_type=thread_type,
            empty_general_message=(
                "General profile context is empty. Ask the user to save their background, goals, "
                "strengths, constraints, and preferences in the Agent profile panel."
            ),
        )

        last_assistant = None
        if memory_setup_error:
            last_assistant = f"Agent unavailable: {memory_setup_error}"
        else:
            try:
                graph = build_graph(
                    thread_context=thread_context,
                    thread_type=thread_type,
                )
                lc_messages = build_langchain_messages(existing_messages)

                with st.spinner("Running tools..."):
                    result = graph.invoke({"messages": lc_messages})
                new_messages = result["messages"][len(lc_messages):]

                for msg in new_messages:
                    if msg.type == "tool":
                        add_chat_message(selected_thread_id, "tool", msg.content)
                        if show_tool_debug:
                            with st.chat_message("tool"):
                                st.markdown(msg.content)
                    elif msg.type in ("assistant", "ai"):
                        last_assistant = msg.content
            except Exception as exc:
                last_assistant = f"Agent unavailable: {exc}"

        if last_assistant:
            add_chat_message(selected_thread_id, "assistant", last_assistant)
            st.rerun()

    if selected_thread_id is not None:
        chat_container = st.container(border=False)
        with chat_container:
            st.markdown('<div class="agent-chat-shell">', unsafe_allow_html=True)
            for msg in get_chat_messages(selected_thread_id):
                if msg["role"] == "tool" and not show_tool_debug:
                    continue
                with st.chat_message(msg["role"]):
                    st.markdown(msg["content"])
            st.markdown("</div>", unsafe_allow_html=True)

        st.chat_input(
            (
                "Ask Deep Agent about your overall search..."
                if selected_thread_type == "general"
                else "Ask this Job Agent about the selected job and resume..."
            ),
            key="memory_input",
            on_submit=_handle_memory_submit,
        )

st.caption("Notes: All data is local SQLite. No resume leaves your machine.")
