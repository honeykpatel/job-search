import streamlit as st
from storage.db import init_db, save_session, list_sessions
from collectors.rss_remoteok import search_remoteok
from storage.db import save_jobs_for_session, get_jobs_for_session
from collectors.api_remotive import search_remotive
from collectors.board_greenhouse import search_greenhouse
from collectors.board_ashby import search_ashby
from utils.dedupe import dedupe_jobs
from storage.db import save_resume, get_latest_resume, list_recent_jobs
from parsing.resume_text import extract_text
from matching.tfidf_ranker import rank_jobs
from memory.graph import build_graph
from langchain_core.messages import AIMessage, HumanMessage

init_db()  # Ensure the database is initialized


def _interleave_jobs(job_lists: list[list[dict]], limit: int) -> list[dict]:
    out: list[dict] = []
    lists = [list(x) for x in job_lists if x]
    while lists and len(out) < limit * max(1, len(lists)):
        next_lists = []
        for lst in lists:
            if lst:
                out.append(lst.pop(0))
            if lst:
                next_lists.append(lst)
        lists = next_lists
    return out

st.set_page_config(page_title="Job Search Agent (Local)", layout="wide")

st.markdown(
    """
    <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Serif+Display&display=swap");
    :root {
        --ink: #132235;
        --muted: #5b6a7a;
        --accent: #0ea5a3;
        --accent-2: #f59e0b;
        --panel: #f5f7fb;
        --panel-2: #eef2f7;
        --stroke: #d9e2ec;
        --shadow: 0 8px 20px rgba(16, 24, 40, 0.08);
    }
    html, body, [class*="css"]  {
        font-family: "Space Grotesk", system-ui, -apple-system, sans-serif;
        color: var(--ink);
    }
    h1, h2, h3, .stTitle {
        font-family: "DM Serif Display", serif;
        letter-spacing: 0.2px;
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
    }
    .stTabs [aria-selected="true"] {
        background: white;
        border-color: var(--stroke);
        box-shadow: 0 4px 16px rgba(16, 24, 40, 0.06);
    }
    .stButton button, .stLinkButton a {
        border-radius: 12px !important;
        border: 1px solid var(--stroke) !important;
        background: white !important;
    }
    .stButton button[kind="primary"] {
        background: linear-gradient(135deg, var(--accent), #22c1c3) !important;
        color: white !important;
        border: none !important;
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
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <div class="app-hero">
      <div class="title">Job Search Agent</div>
      <p class="subtitle">Local search, resume matching, and memory Q&A in one place.</p>
    </div>
    """,
    unsafe_allow_html=True,
)

cols = st.columns(3)
with cols[0]:
    st.markdown(
        '<div class="kpi"><div class="label">Saved sessions</div><div class="value">'
        + str(len(list_sessions(100)))
        + "</div></div>",
        unsafe_allow_html=True,
    )
with cols[1]:
    latest_resume = get_latest_resume()
    st.markdown(
        '<div class="kpi"><div class="label">Resume status</div><div class="value">'
        + ("Ready" if latest_resume else "Missing")
        + "</div></div>",
        unsafe_allow_html=True,
    )
with cols[2]:
    st.markdown(
        '<div class="kpi"><div class="label">Sources</div><div class="value">RemoteOK · Remotive · Boards</div></div>',
        unsafe_allow_html=True,
    )

tab_search, tab_resume, tab_matching, tab_memory = st.tabs(
    ["Job Search", "Resume", "Matching", "Agent / Memory"]
)

with st.sidebar:
    st.header("Search")
    with st.form("search_form"):
        job_title = st.text_input("Job Title", placeholder="e.g., Data Analyst")
        location = st.text_input(
            "Location (optional)", placeholder="e.g., Indianapolis, IN"
        )
        work_style = st.selectbox("Work Style", ["Any", "Remote", "Hybrid", "Onsite"])
        k = st.slider("Number of results", 1, 20, 5)
        submitted = st.form_submit_button("Search for Jobs")
    do_search = submitted

    st.caption("Optional company boards (Greenhouse / Ashby). Paste URL or slug.")
    greenhouse_board = st.text_input("Greenhouse board", placeholder="e.g., greenhouse.io/acme")
    ashby_board = st.text_input("Ashby board", placeholder="e.g., jobs.ashbyhq.com/acme")

    if st.button("Save this search"):
        if not job_title.strip():
            st.warning("Job Title is required to save a session.")
        else:
            sid = save_session(job_title.strip(), location.strip(), work_style, int(k))
            st.success(f"Saved session #{sid}")

    st.divider()
    st.subheader("Saved sessions")
    st.caption("Pick a past session to review jobs in the Search tab.")
    rows = list_sessions(15)
    labels = [f"#{r[0]} {r[1]} ({r[5][:10]})" for r in rows]
    selected = st.selectbox("Pick one", ["(none)"] + labels)

    st.session_state["selected_session_id"] = None
    if selected != "(none)":
        idx = labels.index(selected)
        st.session_state["selected_session_id"] = rows[idx][0]

with tab_search:
    st.write("### Search")
    st.caption("Use the sidebar to run searches and load past sessions.")

    if do_search:
        if not job_title.strip():
            st.warning("Please enter a Job Title to perform a search.")
        else:
            jobs_remoteok = search_remoteok(job_title.strip(), int(k))
            jobs_remotive = search_remotive(job_title.strip(), int(k))
            jobs_greenhouse = (
                search_greenhouse(greenhouse_board.strip(), job_title.strip(), int(k))
                if greenhouse_board.strip()
                else []
            )
            jobs_ashby = (
                search_ashby(ashby_board.strip(), job_title.strip(), int(k))
                if ashby_board.strip()
                else []
            )
            jobs = _interleave_jobs(
                [jobs_remoteok, jobs_remotive, jobs_greenhouse, jobs_ashby], int(k)
            )
            if greenhouse_board.strip():
                pass
            if ashby_board.strip():
                pass
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

with tab_resume:
    st.write("### Upload your resume (PDF or DOCX)")
    st.caption("Tip: Save a resume once, then use Matching or Agent tabs.")
    up = st.file_uploader("Resume", type=["pdf", "docx"])

    if up and st.button("Save Resume"):
        text = extract_text(up)
        rid = save_resume(up.name, text)
        st.success(f"Saved resume #{rid}")
        st.text_area("Extracted text (preview)", text[:4000], height=250)

    latest = get_latest_resume()
    if latest:
        st.write(f"**Latest resume:** #{latest[0]} — {latest[1]} — {latest[3]}")


with tab_matching:
    st.write("### Top Matches")
    st.caption("Ranks recent saved jobs against your latest resume using TF-IDF.")
    latest = get_latest_resume()
    if not latest:
        st.warning("No resume found. Upload and save a resume first.")
    else:
        st.write(f"**Latest resume:** #{latest[0]} — {latest[1]} — {latest[3]}")

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

with tab_memory:
    st.write("### Agent / Memory")
    st.caption("Ask about your saved sessions, jobs, and resume.")
    show_tool_debug = st.checkbox("Show tool results (debug)")

    if "memory_messages" not in st.session_state:
        st.session_state["memory_messages"] = []

    for msg in st.session_state["memory_messages"]:
        if msg["role"] == "tool" and not show_tool_debug:
            continue
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    user_prompt = st.chat_input("Ask a question about your job search history...")
    if user_prompt:
        existing_len = len(st.session_state["memory_messages"])
        st.session_state["memory_messages"].append(
            {"role": "user", "content": user_prompt}
        )
        with st.chat_message("user"):
            st.markdown(user_prompt)

        graph = build_graph()
        lc_messages = []
        for msg in st.session_state["memory_messages"]:
            if msg["role"] == "user":
                lc_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))

        result = graph.invoke({"messages": lc_messages})
        new_messages = result["messages"][len(lc_messages):]

        last_assistant = None
        for msg in new_messages:
            if msg.type == "tool":
                st.session_state["memory_messages"].append(
                    {"role": "tool", "content": msg.content}
                )
                if show_tool_debug:
                    with st.chat_message("tool"):
                        st.markdown(msg.content)
            elif msg.type in ("assistant", "ai"):
                st.session_state["memory_messages"].append(
                    {"role": "assistant", "content": msg.content}
                )
                last_assistant = msg.content

        if last_assistant:
            with st.chat_message("assistant"):
                st.markdown(last_assistant)

st.caption("Notes: All data is local SQLite. No resume leaves your machine.")
