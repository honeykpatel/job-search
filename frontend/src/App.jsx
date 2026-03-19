import { useEffect, useRef, useState } from "react";

const PAGES = ["Job Search", "Resume", "Matching", "Applications", "Profile", "Agent"];
const APPLICATION_STATUSES = ["saved", "applied", "interview", "offer", "rejected", "archived"];
const PROFILE_FIELD_SECTIONS = [
  ["target_roles", "Target roles"],
  ["strongest_skills", "Strongest skills"],
  ["preferred_locations", "Preferred locations"],
  ["work_style_preferences", "Work style preferences"],
  ["compensation_goals", "Compensation goals"],
  ["industries_to_avoid", "Industries to avoid"],
  ["constraints", "Constraints"],
  ["outreach_style", "Outreach style"],
  ["extra_context", "Extra context"],
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = await response.json();
      message = data.detail || data.message || message;
    } catch {
      // Ignore non-JSON responses.
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }
  return new Date(value).toLocaleString();
}

function scoreLabel(score) {
  return Number(score || 0).toFixed(3);
}

function emptyProfileForm() {
  return {
    target_roles: "",
    strongest_skills: "",
    preferred_locations: "",
    work_style_preferences: "",
    compensation_goals: "",
    industries_to_avoid: "",
    constraints: "",
    outreach_style: "",
    extra_context: "",
  };
}

function parseProfileSummary(summaryText) {
  const base = emptyProfileForm();
  const text = (summaryText || "").trim();
  if (!text) {
    return base;
  }

  let matched = false;
  for (let index = 0; index < PROFILE_FIELD_SECTIONS.length; index += 1) {
    const [key, label] = PROFILE_FIELD_SECTIONS[index];
    const nextLabels = PROFILE_FIELD_SECTIONS.slice(index + 1)
      .map((item) => item[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const pattern = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([\\s\\S]*?)(?=\\n(?:${nextLabels}):|$)`,
      "i"
    );
    const match = text.match(pattern);
    if (match) {
      base[key] = match[1].trim();
      matched = true;
    }
  }

  if (!matched) {
    base.extra_context = text;
  }
  return base;
}

function serializeProfileForm(profileForm) {
  return PROFILE_FIELD_SECTIONS.map(([key, label]) => `${label}:\n${(profileForm[key] || "").trim()}`)
    .join("\n\n")
    .trim();
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JobCard({ job }) {
  const description = job.description
    ? String(job.description).replace(/<[^>]+>/g, " ").slice(0, 260)
    : "";

  return (
    <article className="card">
      <div className="card-header">
        <div>
          <h4>{job.title || "Untitled"}</h4>
          <p>{job.company || "Unknown company"}</p>
        </div>
        <span className="status-pill">{job.source || "Unknown source"}</span>
      </div>
      <p className="muted">{job.location || "Unknown location"}</p>
      {description ? <p className="body-copy">{description}</p> : null}
      {job.url ? (
        <a className="link" href={job.url} target="_blank" rel="noreferrer">
          Open posting
        </a>
      ) : null}
      {"created_at" in job ? <p className="tiny">{formatDate(job.created_at)}</p> : null}
    </article>
  );
}

function PipelineItem({ item, showPriority = false }) {
  return (
    <article className="card compact">
      <div className="card-header">
        <div>
          <h4>{item.job_title || item.title || "Untitled"}</h4>
          <p>{item.company || "Unknown company"}</p>
        </div>
        <span className="status-pill">
          {showPriority ? `score ${item.priority_score || 0}` : item.follow_up_status || item.status || "ok"}
        </span>
      </div>
      <p className="muted">
        {(item.status && `status=${item.status}`) || "saved"}
        {item.days_since_update !== undefined && item.days_since_update !== null
          ? ` | ${item.days_since_update}d since update`
          : ""}
      </p>
      {item.follow_up_reason ? <p className="body-copy">{item.follow_up_reason}</p> : null}
      {Array.isArray(item.priority_reasons) && item.priority_reasons.length ? (
        <p className="tiny">{item.priority_reasons.join(" | ")}</p>
      ) : null}
    </article>
  );
}

function renderInlineMarkdown(text, keyPrefix) {
  const tokens = String(text || "").split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);

  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }

    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={key}>{token.slice(1, -1)}</code>;
    }

    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      );
    }

    return token;
  });
}

function MarkdownMessage({ content }) {
  const text = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return null;
  }

  const blocks = text.split(/```/);

  return (
    <div className="markdown-message">
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;

        if (blockIndex % 2 === 1) {
          const codeLines = block.split("\n");
          const firstLine = codeLines[0]?.trim() || "";
          const language = /^[a-z0-9#+-]+$/i.test(firstLine) ? firstLine : "";
          const code = language ? codeLines.slice(1).join("\n") : block;

          return (
            <pre key={key} className="markdown-code-block">
              {language ? <span className="markdown-code-lang">{language}</span> : null}
              <code>{code.trim()}</code>
            </pre>
          );
        }

        const lines = block.split("\n");
        const elements = [];
        let listItems = [];
        let listType = null;

        const flushList = () => {
          if (!listItems.length) {
            return;
          }

          const ListTag = listType === "ol" ? "ol" : "ul";
          elements.push(
            <ListTag key={`${key}-list-${elements.length}`}>
              {listItems.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-item-${itemIndex}`)}</li>
              ))}
            </ListTag>
          );
          listItems = [];
          listType = null;
        };

        lines.forEach((line, lineIndex) => {
          const trimmed = line.trim();

          if (!trimmed) {
            flushList();
            return;
          }

          const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
          if (headingMatch) {
            flushList();
            const HeadingTag = `h${headingMatch[1].length}`;
            elements.push(
              <HeadingTag key={`${key}-heading-${lineIndex}`}>
                {renderInlineMarkdown(headingMatch[2], `${key}-heading-${lineIndex}`)}
              </HeadingTag>
            );
            return;
          }

          const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
          if (orderedMatch) {
            if (listType && listType !== "ol") {
              flushList();
            }
            listType = "ol";
            listItems.push(orderedMatch[1]);
            return;
          }

          const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
          if (unorderedMatch) {
            if (listType && listType !== "ul") {
              flushList();
            }
            listType = "ul";
            listItems.push(unorderedMatch[1]);
            return;
          }

          flushList();
          elements.push(
            <p key={`${key}-paragraph-${lineIndex}`}>
              {renderInlineMarkdown(trimmed, `${key}-paragraph-${lineIndex}`)}
            </p>
          );
        });

        flushList();
        return <div key={key}>{elements}</div>;
      })}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("Job Search");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessions, setSessions] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [threads, setThreads] = useState([]);
  const [profile, setProfile] = useState({ summary_text: "" });
  const [profileForm, setProfileForm] = useState(emptyProfileForm());
  const [pipelineSummary, setPipelineSummary] = useState(null);
  const [sidebarFilter, setSidebarFilter] = useState("");

  const [searchForm, setSearchForm] = useState({
    job_title: "",
    location: "",
    work_style: "Any",
    k: 5,
    greenhouse_board: "",
    ashby_board: "",
  });
  const [searchResult, setSearchResult] = useState({ session_id: null, jobs: [], sources: {} });
  const [searching, setSearching] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSessionJobs, setSelectedSessionJobs] = useState([]);
  const [selectedSessionJobId, setSelectedSessionJobId] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);

  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [selectedResume, setSelectedResume] = useState(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [showResumeUploadModal, setShowResumeUploadModal] = useState(false);

  const [matchResumeId, setMatchResumeId] = useState("");
  const [matchTopK, setMatchTopK] = useState(5);
  const [matchMeta, setMatchMeta] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [applicationQuery, setApplicationQuery] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("All");
  const [applicationLimit, setApplicationLimit] = useState(20);
  const [applicationJobs, setApplicationJobs] = useState([]);
  const [selectedApplicationJobId, setSelectedApplicationJobId] = useState("");
  const [savingApplication, setSavingApplication] = useState(false);

  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [timelineEventsByThread, setTimelineEventsByThread] = useState({});
  const [showToolDebug, setShowToolDebug] = useState(false);
  const [newThreadForm, setNewThreadForm] = useState({ job_id: "", resume_id: "" });
  const [showNewJobAgentModal, setShowNewJobAgentModal] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const chatLogRef = useRef(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSessionJobs([]);
      setSelectedSessionJobId("");
      return;
    }

    void (async () => {
      try {
        setError("");
        const data = await api(`/api/sessions/${selectedSessionId}/jobs`);
        setSelectedSessionJobs(data);
        setSelectedSessionJobId((current) => (data.some((job) => job.id === current) ? current : (data[0]?.id || "")));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedResumeId) {
      setSelectedResume(null);
      return;
    }

    void (async () => {
      try {
        setError("");
        const data = await api(`/api/resumes/${selectedResumeId}`);
        setSelectedResume(data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [selectedResumeId]);

  useEffect(() => {
    void loadApplicationJobs();
  }, [applicationQuery, applicationStatusFilter, applicationLimit]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      setPendingAction(null);
      return;
    }
    void loadThread(selectedThreadId);
    setPendingAction(null);
  }, [selectedThreadId]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog || page !== "Agent") {
      return;
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [page, selectedThreadId, selectedThread?.messages]);

  async function bootstrap() {
    try {
      setError("");
      let [sessionData, resumeData, recentJobs, threadData, profileData, pipelineData] = await Promise.all([
        api("/api/sessions"),
        api("/api/resumes"),
        api("/api/jobs/recent?limit=200"),
        api("/api/threads"),
        api("/api/profile"),
        api("/api/pipeline-summary"),
      ]);
      if (!threadData.some((thread) => thread.thread_type === "general")) {
        const deepAgentThread = await api("/api/threads/general", { method: "POST" });
        threadData = [deepAgentThread, ...threadData];
      }
      setSessions(sessionData);
      setResumes(resumeData);
      setJobs(recentJobs);
      setThreads(threadData);
      setProfile(profileData || { summary_text: "" });
      setProfileForm(parseProfileSummary((profileData || {}).summary_text || ""));
      setPipelineSummary(pipelineData);
      if (resumeData[0]) {
        setSelectedResumeId(resumeData[0].id);
        setMatchResumeId(String(resumeData[0].id));
      }
      if (threadData[0]) {
        setSelectedThreadId(threadData[0].id);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshCollections() {
    let [sessionData, resumeData, recentJobs, threadData, pipelineData] = await Promise.all([
      api("/api/sessions"),
      api("/api/resumes"),
      api("/api/jobs/recent?limit=200"),
      api("/api/threads"),
      api("/api/pipeline-summary"),
    ]);
    if (!threadData.some((thread) => thread.thread_type === "general")) {
      const deepAgentThread = await api("/api/threads/general", { method: "POST" });
      threadData = [deepAgentThread, ...threadData];
    }
    setSessions(sessionData);
    setResumes(resumeData);
    setJobs(recentJobs);
    setThreads(threadData);
    setPipelineSummary(pipelineData);
    setSelectedSessionId((current) =>
      current && sessionData.some((session) => session.id === current) ? current : null
    );
    setSelectedThreadId((current) =>
      current && threadData.some((thread) => thread.id === current) ? current : null
    );
  }

  async function loadThread(threadId) {
    try {
      setError("");
      const data = await api(`/api/threads/${threadId}`);
      setSelectedThread(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadApplicationJobs() {
    try {
      setError("");
      const params = new URLSearchParams({
        query: applicationQuery,
        limit: String(applicationLimit),
      });
      if (applicationStatusFilter !== "All") {
        params.set("status", applicationStatusFilter);
      }
      const data = await api(`/api/jobs?${params.toString()}`);
      setApplicationJobs(data);
      if (data.length) {
        setSelectedApplicationJobId((current) =>
          data.some((job) => job.id === current) ? current : data[0].id
        );
      } else {
        setSelectedApplicationJobId("");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    try {
      setSearching(true);
      setError("");
      setNotice("");
      const data = await api("/api/search", {
        method: "POST",
        body: JSON.stringify({ ...searchForm, k: Number(searchForm.k), save_results: true }),
      });
      setSearchResult(data);
      setNotice(`Saved session #${data.session_id} with ${data.jobs.length} jobs.`);
      setSelectedSessionId(data.session_id);
      setShowSearchModal(false);
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadingResume(true);
      setError("");
      setNotice("");
      const resume = await api("/api/resumes", { method: "POST", body: formData });
      setNotice(`Saved resume #${resume.id}.`);
      setSelectedResumeId(resume.id);
      setMatchResumeId(String(resume.id));
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingResume(false);
      event.target.value = "";
    }
  }

  async function handleLoadMatches() {
    try {
      setLoadingMatches(true);
      setError("");
      const params = new URLSearchParams({ top_k: String(matchTopK) });
      if (matchResumeId) {
        params.set("resume_id", matchResumeId);
      }
      const data = await api(`/api/matches?${params.toString()}`);
      setMatchMeta(data.resume);
      setMatches(data.matches || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMatches(false);
    }
  }

  async function handleSaveProfile() {
    try {
      setError("");
      const summaryText = serializeProfileForm(profileForm);
      const saved = await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ summary_text: summaryText }),
      });
      setProfile(saved);
      setProfileForm(parseProfileSummary(saved.summary_text || ""));
      setNotice("Agent context saved.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateGeneralThread() {
    try {
      setError("");
      const thread = await api("/api/threads/general", { method: "POST" });
      await refreshCollections();
      setSelectedThreadId(thread.id);
      setPage("Agent");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateJobThread(event) {
    event.preventDefault();
    if (!newThreadForm.job_id || !newThreadForm.resume_id) {
      setError("Select both a job and a resume to create a Helper.");
      return;
    }

    try {
      setError("");
      const thread = await api("/api/threads/job", {
        method: "POST",
        body: JSON.stringify({
          job_id: newThreadForm.job_id,
          resume_id: Number(newThreadForm.resume_id),
        }),
      });
      await refreshCollections();
      setSelectedThreadId(thread.id);
      setNewThreadForm({ job_id: "", resume_id: "" });
      setShowNewJobAgentModal(false);
      setPage("Agent");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendChat(event) {
    event.preventDefault();
    if (!selectedThreadId || !chatInput.trim()) {
      return;
    }

    try {
      setSendingChat(true);
      setError("");
      const response = await api(`/api/threads/${selectedThreadId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: chatInput,
          show_tool_debug: showToolDebug,
        }),
      });
      setSelectedThread((current) => ({ ...(current || {}), messages: response.messages }));
      setPendingAction(response.pending_action || null);
      setChatInput("");
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingChat(false);
    }
  }

  async function handleClearThread() {
    if (!selectedThreadId) {
      return;
    }

    try {
      setError("");
      await api(`/api/threads/${selectedThreadId}/clear`, { method: "POST" });
      setPendingAction(null);
      setTimelineEventsByThread((current) => ({ ...current, [selectedThreadId]: [] }));
      await loadThread(selectedThreadId);
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteThread(threadId) {
    try {
      setError("");
      await api(`/api/threads/${threadId}`, { method: "DELETE" });
      if (selectedThreadId === threadId) {
        setPendingAction(null);
      }
      await refreshCollections();
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSession(sessionId) {
    const confirmed = window.confirm(
      "Delete this session and all jobs, job chats, and related application data created from it?"
    );
    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await api(`/api/sessions/${sessionId}`, { method: "DELETE" });
      setNotice(`Deleted session #${sessionId} and its related jobs, chats, and tracker data.`);
      setSearchResult((current) =>
        current.session_id === sessionId ? { session_id: null, jobs: [], sources: {} } : current
      );
      setSelectedSessionJobs((current) =>
        selectedSessionId === sessionId ? [] : current
      );
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteResume(resumeId) {
    const confirmed = window.confirm("Delete this saved resume?");
    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await api(`/api/resumes/${resumeId}`, { method: "DELETE" });
      if (selectedResumeId === resumeId) {
        setSelectedResumeId(null);
      }
      setNotice(`Deleted resume #${resumeId}.`);
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveApplication(job) {
    try {
      setSavingApplication(true);
      setError("");
      await api(`/api/applications/${job.id}`, {
        method: "PUT",
        body: JSON.stringify({
          resume_id: job.resume_id || null,
          status: job.application_status || "saved",
          notes: job.application_notes || "",
        }),
      });
      setNotice(`Updated tracker for ${job.title || "job"}.`);
      await refreshCollections();
      await loadApplicationJobs();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingApplication(false);
    }
  }

  async function handleApprovePendingAction() {
    if (!selectedThreadId || !pendingAction?.preview?.action) {
      return;
    }

    try {
      setError("");
      const action = pendingAction.preview.action;
      const lastVisibleMessageId = [...(selectedThread?.messages || [])]
        .filter((message) => showToolDebug || message.role !== "tool")
        .at(-1)?.id;
      await api(`/api/threads/${selectedThreadId}/actions/approve`, {
        method: "POST",
        body: JSON.stringify({
          action_type: action.type,
          params: action.params,
        }),
      });
      const eventText = approvalEventLabel(action.type, true);
      setPendingAction(null);
      setNotice("Approved action completed.");
      await refreshCollections();
      await loadThread(selectedThreadId);
      appendTimelineEvent(selectedThreadId, eventText, lastVisibleMessageId);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleRejectPendingAction() {
    const actionType = pendingAction?.preview?.action?.type;
    const lastVisibleMessageId = [...(selectedThread?.messages || [])]
      .filter((message) => showToolDebug || message.role !== "tool")
      .at(-1)?.id;
    setPendingAction(null);
    setNotice("Action cancelled.");
    if (selectedThreadId && actionType) {
      appendTimelineEvent(selectedThreadId, approvalEventLabel(actionType, false), lastVisibleMessageId);
    }
  }

  function appendTimelineEvent(threadId, content, afterMessageId = null) {
    const createdAt = new Date().toISOString();
    const event = {
      id: `timeline-${threadId}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      role: "timeline_event",
      content,
      created_at: createdAt,
      after_message_id: afterMessageId,
    };
    setTimelineEventsByThread((current) => ({
      ...current,
      [threadId]: [...(current[threadId] || []), event],
    }));
  }

  function approvalEventLabel(actionType, approved) {
    const base =
      {
        save_application: "Application update",
        update_current_application: "Application update",
        create_helper: "Helper creation",
        rename_helper: "Helper rename",
        delete_helper: "Helper deletion",
      }[actionType] || "Change";
    return approved ? `${base} completed` : `${base} cancelled`;
  }

  function renderPendingActionPreview() {
    if (!pendingAction?.preview) {
      return null;
    }

    const preview = pendingAction.preview;
    const actionLabel = pendingAction.tool_name || preview.action?.type || "pending action";

    return (
      <div className="approval-card">
        <div className="approval-head">
          <div>
            <div className="approval-eyebrow">Approval Required</div>
            <h4>{actionLabel.replaceAll("_", " ")}</h4>
            <p>{pendingAction.message || "Review this change before applying it."}</p>
          </div>
          <span className="status-pill">Not applied yet</span>
        </div>

        {preview.job ? (
          <div className="approval-section">
            <strong>Job</strong>
            <p>
              {preview.job.title || "Untitled"} @ {preview.job.company || "Unknown company"}
              {preview.job.location ? ` (${preview.job.location})` : ""}
            </p>
          </div>
        ) : null}

        {preview.resume ? (
          <div className="approval-section">
            <strong>Resume</strong>
            <p>
              #{preview.resume.id} | {preview.resume.filename}
            </p>
          </div>
        ) : null}

        {preview.proposed_application ? (
          <div className="approval-section">
            <strong>Proposed application update</strong>
            <p>Status: {preview.proposed_application.status || "saved"}</p>
            <p>
              Resume: {preview.proposed_application.resume_filename || "(none)"}
            </p>
            {preview.proposed_application.notes ? (
              <p>Notes: {preview.proposed_application.notes}</p>
            ) : null}
          </div>
        ) : null}

        {preview.current_title || preview.new_title ? (
          <div className="approval-section">
            <strong>Rename Helper</strong>
            <p>Current: {preview.current_title || "Untitled Helper"}</p>
            <p>New: {preview.new_title || "Untitled Helper"}</p>
          </div>
        ) : null}

        {preview.title && preview.thread_type === "job" ? (
          <div className="approval-section">
            <strong>New Helper</strong>
            <p>Title: {preview.title}</p>
          </div>
        ) : null}

        {preview.helper_id && !preview.current_title && !preview.new_title ? (
          <div className="approval-section">
            <strong>Delete Helper</strong>
            <p>{preview.title || `Helper #${preview.helper_id}`}</p>
          </div>
        ) : null}

        <div className="approval-actions">
          <button className="action-button primary" type="button" onClick={() => void handleApprovePendingAction()}>
            Approve
          </button>
          <button className="action-button subtle" type="button" onClick={handleRejectPendingAction}>
            Reject
          </button>
        </div>
      </div>
    );
  }

  const selectedApplicationJob =
    applicationJobs.find((job) => job.id === selectedApplicationJobId) || null;
  const visibleThreadMessages = (selectedThread?.messages || []).filter(
    (message) => showToolDebug || message.role !== "tool"
  );
  const threadTimelineEvents = timelineEventsByThread[selectedThreadId] || [];
  const combinedThreadMessages = [];

  visibleThreadMessages.forEach((message) => {
    combinedThreadMessages.push(message);
    threadTimelineEvents
      .filter((event) => event.after_message_id === message.id)
      .forEach((event) => {
        combinedThreadMessages.push(event);
      });
  });

  threadTimelineEvents
    .filter(
      (event) =>
        !event.after_message_id ||
        !visibleThreadMessages.some((message) => message.id === event.after_message_id)
    )
    .forEach((event) => {
      if (!combinedThreadMessages.some((item) => item.id === event.id)) {
        combinedThreadMessages.push(event);
      }
    });

  const applicationStats = {
    tracked: applicationJobs.length,
    applied: applicationJobs.filter((item) => item.application_status === "applied").length,
    interview: applicationJobs.filter((item) => item.application_status === "interview").length,
    offer: applicationJobs.filter((item) => item.application_status === "offer").length,
  };
  const normalizedSidebarFilter = sidebarFilter.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    if (!normalizedSidebarFilter) {
      return true;
    }
    return [session.job_title, session.location, session.work_style, String(session.id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSidebarFilter));
  });
  const filteredThreads = threads.filter((thread) => {
    if (!normalizedSidebarFilter) {
      return true;
    }
    return [thread.title, thread.thread_type, String(thread.id)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSidebarFilter));
  });
  const generalThreads = filteredThreads.filter((thread) => thread.thread_type === "general");
  const jobThreads = filteredThreads.filter((thread) => thread.thread_type !== "general");
  const jobsById = Object.fromEntries(jobs.map((job) => [job.id, job]));
  const resumesById = Object.fromEntries(resumes.map((resume) => [resume.id, resume]));
  const selectedSessionJob = selectedSessionJobs.find((job) => job.id === selectedSessionJobId) || selectedSessionJobs[0] || null;
  const bestMatchScore = matches.length ? Math.max(...matches.map((item) => Number(item.score || 0))) : null;
  const leastMatchScore = matches.length ? Math.min(...matches.map((item) => Number(item.score || 0))) : null;
  const quickPrompts =
    selectedThread?.thread_type === "general"
      ? [
          "Summarize my full pipeline",
          "What needs follow-up right now?",
          "What should I prioritize this week?",
          "Create a weekly search plan",
        ]
      : [
          "What are the gaps for this role?",
          "Draft a follow-up for this job",
          "How should I prepare for this interview?",
          "Update this application plan",
        ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="sidebar-card sidebar-panel">
          {page === "Profile" ? (
            <>
              <div className="sidebar-section-head">
                <div>
                  <p className="eyebrow">Standing Context</p>
                  <h3>Agent Profile</h3>
                </div>
                <span className="sidebar-chip">Profile</span>
              </div>
              <div className="sidebar-note">
                This tab defines your standing context for Agent. Jobs, applications, resumes, and notes remain in the saved database and do not belong here.
              </div>
              <div className="sidebar-note-card profile-sidebar-card">
                <span className="sidebar-type-badge deep">Agent</span>
                <p className="muted">
                  Tell the agent what kind of roles you want, what you are strongest at, what constraints matter, and what preferences should shape advice across all chats.
                </p>
              </div>
            </>
          ) : null}
          {page === "Profile" ? null : page === "Agent" ? (
            <>
              <div className="sidebar-list">
                {generalThreads.length ? (
                  generalThreads.map((thread) => (
                    <div key={thread.id} className="sidebar-item-row">
                      <button
                        type="button"
                        className={`mini-button sidebar-item ${selectedThreadId === thread.id ? "active" : ""}`}
                        onClick={() => setSelectedThreadId(thread.id)}
                      >
                        <span className="sidebar-item-title">Agent</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="sidebar-empty">Agent is created automatically for this user.</p>
                )}

                <div className="sidebar-inline-section">
                  <span className="sidebar-group-label">New Helper</span>
                  <button
                    className="action-button primary sidebar-action"
                    type="button"
                    onClick={() => setShowNewJobAgentModal(true)}
                  >
                    New Helper
                  </button>
                </div>

                {jobThreads.length ? (
                  jobThreads.map((thread) => {
                    const job = jobsById[thread.job_id];
                    const resume = resumesById[thread.resume_id];
                    const helperTitle = `${job?.title || "Untitled"} @ ${job?.company || "Unknown"}`;
                    const helperStatus = job?.application_status || "saved";
                    const helperResume = resume?.filename || "No resume";
                    return (
                      <div key={thread.id} className="sidebar-item-row sidebar-item-row-helper">
                        <button
                          type="button"
                          className={`mini-button sidebar-item sidebar-helper-item ${selectedThreadId === thread.id ? "active" : ""}`}
                          onClick={() => setSelectedThreadId(thread.id)}
                          title={`${helperTitle} | ${helperResume}`}
                        >
                          <span className="sidebar-item-title">{helperTitle}</span>
                          <span className="sidebar-item-meta sidebar-helper-meta">
                            <span className="sidebar-type-badge status">{helperStatus}</span>
                            <span>{helperResume}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-button destructive sidebar-inline-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteThread(thread.id);
                          }}
                          aria-label={`Delete thread ${thread.id}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-delete-icon">
                            <path
                              d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v7h-2v-7Zm4 0h2v7h-2v-7ZM7 10h2v7H7v-7Zm1 11c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="sidebar-empty">No helpers yet.</p>
                )}
              </div>
            </>
          ) : page === "Job Search" ? (
            <>
              <button
                className="action-button primary sidebar-action"
                type="button"
                onClick={() => setShowSearchModal(true)}
              >
                Search Jobs
              </button>
              <div className="sidebar-inline-section">
                <span className="sidebar-group-label">Saved Searches</span>
              </div>
              <div className="sidebar-list">
                {filteredSessions.length ? (
                  filteredSessions.map((session) => {
                    const sessionTitle = session.job_title || "Untitled search";
                    const sessionMeta = new Date(session.created_at).toLocaleDateString();
                    return (
                      <div key={session.id} className="sidebar-item-row sidebar-item-row-helper">
                        <button
                          type="button"
                          className={`mini-button sidebar-item sidebar-helper-item ${selectedSessionId === session.id ? "active" : ""}`}
                          onClick={() => setSelectedSessionId(session.id)}
                          title={sessionTitle}
                        >
                          <span className="sidebar-item-title">{sessionTitle}</span>
                          <span className="sidebar-item-meta sidebar-helper-meta">
                            <span>{sessionMeta}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-button destructive sidebar-inline-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteSession(session.id);
                          }}
                          aria-label={`Delete session ${session.id}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-delete-icon">
                            <path
                              d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v7h-2v-7Zm4 0h2v7h-2v-7ZM7 10h2v7H7v-7Zm1 11c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="sidebar-empty">No sessions yet.</p>
                )}
              </div>
            </>
          ) : page === "Resume" ? (
            <>
              <button
                className="action-button primary sidebar-action"
                type="button"
                onClick={() => setShowResumeUploadModal(true)}
              >
                New Resume
              </button>
              <div className="sidebar-inline-section">
                <span className="sidebar-group-label">Saved Resumes</span>
              </div>
              <div className="sidebar-list">
                {resumes.length ? (
                  resumes.map((resume) => (
                    <div key={resume.id} className="sidebar-item-row sidebar-item-row-helper">
                      <button
                        type="button"
                        className={`mini-button sidebar-item sidebar-helper-item ${selectedResumeId === resume.id ? "active" : ""}`}
                        onClick={() => setSelectedResumeId(resume.id)}
                        title={resume.filename}
                      >
                        <span className="sidebar-item-title">{resume.filename}</span>
                        <span className="sidebar-item-meta sidebar-helper-meta">
                          <span>{new Date(resume.created_at).toLocaleDateString()}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button destructive sidebar-inline-delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteResume(resume.id);
                        }}
                        aria-label={`Delete resume ${resume.id}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="sidebar-delete-icon">
                          <path
                            d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v7h-2v-7Zm4 0h2v7h-2v-7ZM7 10h2v7H7v-7Zm1 11c-1.1 0-2-.9-2-2V8h12v11c0 1.1-.9 2-2 2H8Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="sidebar-empty">No resumes saved yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="sidebar-list">
              {filteredSessions.length ? filteredSessions.map((session) => (
                <div key={session.id} className="sidebar-item-row">
                  <button
                    type="button"
                    className={`mini-button sidebar-item ${selectedSessionId === session.id ? "active" : ""}`}
                    onClick={() => setSelectedSessionId(session.id)}
                  >
                    <span className="sidebar-item-title">{session.job_title || "Untitled search"}</span>
                    <span className="sidebar-item-meta">
                      <span className="sidebar-type-badge session">Session</span>
                      <span>{new Date(session.created_at).toLocaleDateString()} | {session.k} results</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button destructive"
                    onClick={() => void handleDeleteSession(session.id)}
                    aria-label={`Delete session ${session.id}`}
                  >
                    x
                  </button>
                </div>
              )) : <p className="sidebar-empty">No sessions match the filter.</p>}
            </div>
          )}
        </section>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            <h1>Job Search Agent</h1>
          </div>
          <nav className="topbar-nav">
            {PAGES.map((item) => (
              <button
                key={item}
                className={`nav-button topbar-nav-button ${item === page ? "active" : ""}`}
                onClick={() => setPage(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {notice ? <div className="banner success">{notice}</div> : null}

        {page === "Job Search" ? (
          <section className="grid two-up job-search-layout">
            <div className="panel job-session-list-panel">
              <div className="section-heading">
                <h3>Searched Jobs</h3>
                <p>{selectedSessionId ? `Jobs saved under session #${selectedSessionId}.` : "Select a session from the sidebar."}</p>
              </div>
              <div className="job-session-list">
                {selectedSessionJobs.length ? (
                  selectedSessionJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className={`mini-button job-list-item ${selectedSessionJob?.id === job.id ? "active" : ""}`}
                      onClick={() => setSelectedSessionJobId(job.id)}
                    >
                      <span className="job-list-title">{job.title || "Untitled"}</span>
                      <span className="job-list-meta">{job.company || "Unknown company"}</span>
                      <span className="job-list-meta">{job.location || "Unknown location"}</span>
                    </button>
                  ))
                ) : (
                  <p className="sidebar-empty">No jobs in this session.</p>
                )}
              </div>
            </div>

            <div className="panel job-detail-panel">
              <div className="section-heading">
                <h3>Job Details</h3>
                <p>{selectedSessionJob ? `${selectedSessionJob.title || "Untitled"} @ ${selectedSessionJob.company || "Unknown company"}` : "Select a job from the left card."}</p>
              </div>
              {selectedSessionJob ? (
                <div className="stack">
                  <div className="meta-row">
                    {selectedSessionJob.source ? <span className="status-pill">{selectedSessionJob.source}</span> : null}
                    {selectedSessionJob.job_type ? <span className="status-pill">{selectedSessionJob.job_type}</span> : null}
                    {selectedSessionJob.salary_text ? <span className="status-pill">{selectedSessionJob.salary_text}</span> : null}
                    {selectedSessionJob.application_status ? (
                      <span className="status-pill">{selectedSessionJob.application_status}</span>
                    ) : null}
                  </div>
                  <div className="subpanel compact-stack">
                    <strong>Company</strong>
                    <span>{selectedSessionJob.company || "Unknown company"}</span>
                  </div>
                  <div className="subpanel compact-stack">
                    <strong>Location</strong>
                    <span>{selectedSessionJob.location || "Unknown location"}</span>
                  </div>
                  {selectedSessionJob.search_query ? (
                    <div className="subpanel compact-stack">
                      <strong>Search Query</strong>
                      <span>{selectedSessionJob.search_query}</span>
                    </div>
                  ) : null}
                  {selectedSessionJob.description ? (
                    <div className="subpanel compact-stack">
                      <strong>Description</strong>
                      <div className="text-preview job-detail-copy">{String(selectedSessionJob.description).replace(/<[^>]+>/g, " ")}</div>
                    </div>
                  ) : null}
                  {selectedSessionJob.url ? (
                    <a className="link" href={selectedSessionJob.url} target="_blank" rel="noreferrer">
                      Open posting
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="muted">Choose a session and then select a job to inspect its details.</p>
              )}
            </div>
          </section>
        ) : null}

        {page === "Resume" ? (
          <section className="grid">
            <div className="panel resume-preview-panel">
              <div className="section-heading">
                <h3>Resume Preview</h3>
                <p>{selectedResume ? selectedResume.filename : "Select a saved resume."}</p>
              </div>
              <div className="text-preview">{selectedResume?.text || "No resume selected."}</div>
            </div>
          </section>
        ) : null}

        {page === "Matching" ? (
          <section className="grid two-up">
            <div className="panel">
              <div className="section-heading">
                <h3>Top Matches</h3>
                <p>Uses the same TF-IDF ranker already in the repository.</p>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Resume</span>
                  <select value={matchResumeId} onChange={(event) => setMatchResumeId(event.target.value)}>
                    <option value="">Latest saved resume</option>
                    {resumes.map((resume) => (
                      <option key={resume.id} value={resume.id}>
                        #{resume.id} | {resume.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Top K</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={matchTopK}
                    onChange={(event) => setMatchTopK(event.target.value)}
                  />
                </label>
              </div>
              <button className="action-button primary" type="button" onClick={handleLoadMatches} disabled={loadingMatches}>
                {loadingMatches ? "Ranking..." : "Find Matches"}
              </button>
              {matchMeta ? <p className="muted">Using resume #{matchMeta.id} | {matchMeta.filename}</p> : null}
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Ranked Jobs</h3>
                <p>{matches.length ? `${matches.length} matches` : "No matches loaded yet."}</p>
              </div>
              {matches.length ? (
                <div className="meta-row">
                  <span className="status-pill">Range: {scoreLabel(leastMatchScore)} to {scoreLabel(bestMatchScore)}</span>
                  <span className="status-pill">Best: {scoreLabel(bestMatchScore)}</span>
                  <span className="status-pill">Least: {scoreLabel(leastMatchScore)}</span>
                </div>
              ) : null}
              <div className="stack">
                {matches.map((item) => (
                  <div key={item.job.id} className="card accent">
                    <div className="card-header">
                      <div>
                        <h4>{item.job.title || "Untitled"}</h4>
                        <p>{item.job.company || "Unknown company"}</p>
                      </div>
                      <span className="score-pill">{scoreLabel(item.score)}</span>
                    </div>
                    <p className="muted">{item.job.location || "Unknown location"} | {item.job.source || "Unknown source"}</p>
                    {item.job.url ? (
                      <a className="link" href={item.job.url} target="_blank" rel="noreferrer">
                        Open posting
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {page === "Applications" ? (
          <section className="grid two-up">
            <div className="panel span-two">
              <div className="metric-row">
                <Metric label="Tracked" value={applicationStats.tracked} />
                <Metric label="Applied" value={applicationStats.applied} />
                <Metric label="Interview" value={applicationStats.interview} />
                <Metric label="Offer" value={applicationStats.offer} />
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Search Saved Jobs</h3>
              </div>
              <label className="field">
                <span>Query</span>
                <input value={applicationQuery} onChange={(event) => setApplicationQuery(event.target.value)} />
              </label>
              <div className="inline-fields">
                <label className="field">
                  <span>Status</span>
                  <select
                    value={applicationStatusFilter}
                    onChange={(event) => setApplicationStatusFilter(event.target.value)}
                  >
                    <option>All</option>
                    {APPLICATION_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Limit</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={applicationLimit}
                    onChange={(event) => setApplicationLimit(event.target.value)}
                  />
                </label>
              </div>
              <div className="stack">
                {applicationJobs.map((job) => (
                  <button
                    key={job.id}
                    className={`mini-button ${selectedApplicationJobId === job.id ? "active" : ""}`}
                    type="button"
                    onClick={() => setSelectedApplicationJobId(job.id)}
                  >
                    {job.title || "Untitled"} | {job.company || "Unknown"} | {job.application_status || "saved"}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              {selectedApplicationJob ? (
                <>
                  <div className="section-heading">
                    <h3>{selectedApplicationJob.title || "Untitled"}</h3>
                    <p>{selectedApplicationJob.company || "Unknown company"}</p>
                  </div>
                  <div className="meta-row">
                    <span className="status-pill">{selectedApplicationJob.location || "Unknown location"}</span>
                    <span className="status-pill">{selectedApplicationJob.source || "Unknown source"}</span>
                  </div>
                  <div className="inline-fields">
                    <label className="field">
                      <span>Status</span>
                      <select
                        value={selectedApplicationJob.application_status || "saved"}
                        onChange={(event) =>
                          setApplicationJobs((current) =>
                            current.map((job) =>
                              job.id === selectedApplicationJob.id
                                ? { ...job, application_status: event.target.value }
                                : job
                            )
                          )
                        }
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Resume</span>
                      <select
                        value={selectedApplicationJob.resume_id || ""}
                        onChange={(event) =>
                          setApplicationJobs((current) =>
                            current.map((job) =>
                              job.id === selectedApplicationJob.id
                                ? {
                                    ...job,
                                    resume_id: event.target.value ? Number(event.target.value) : null,
                                  }
                                : job
                            )
                          )
                        }
                      >
                        <option value="">(none)</option>
                        {resumes.map((resume) => (
                          <option key={resume.id} value={resume.id}>
                            #{resume.id} | {resume.filename}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows="10"
                      value={selectedApplicationJob.application_notes || ""}
                      onChange={(event) =>
                        setApplicationJobs((current) =>
                          current.map((job) =>
                            job.id === selectedApplicationJob.id
                              ? { ...job, application_notes: event.target.value }
                              : job
                          )
                        )
                      }
                    />
                  </label>
                  <button
                    className="action-button primary"
                    type="button"
                    disabled={savingApplication}
                    onClick={() => void handleSaveApplication(selectedApplicationJob)}
                  >
                    {savingApplication ? "Saving..." : "Update Tracker"}
                  </button>
                  {selectedApplicationJob.url ? (
                    <a className="link" href={selectedApplicationJob.url} target="_blank" rel="noreferrer">
                      Open posting
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="muted">No saved jobs match the current filters.</p>
              )}
            </div>
          </section>
        ) : null}

        {page === "Profile" ? (
          <section className="grid profile-layout">
            <div className="panel span-two profile-intro-panel">
              <div className="section-heading">
                <h3>Agent Profile</h3>
                <p>Fill this once and keep it updated. Agent uses it as your standing context across all conversations.</p>
              </div>
              <div className="meta-row">
                <span className="status-pill">Persistent user context</span>
                <span className="status-pill">Separate from jobs and applications</span>
              </div>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Goals</h3>
              </div>
              <label className="field">
                <span>Target roles</span>
                <textarea
                  rows="5"
                  value={profileForm.target_roles}
                  onChange={(event) => setProfileForm({ ...profileForm, target_roles: event.target.value })}
                  placeholder="Frontend engineer, full-stack product engineer, design systems, AI product roles..."
                />
              </label>
              <label className="field">
                <span>Compensation goals</span>
                <textarea
                  rows="4"
                  value={profileForm.compensation_goals}
                  onChange={(event) => setProfileForm({ ...profileForm, compensation_goals: event.target.value })}
                  placeholder="Target comp range, must-have benefits, equity preferences, contract vs full-time..."
                />
              </label>
              <label className="field">
                <span>Preferred locations</span>
                <textarea
                  rows="4"
                  value={profileForm.preferred_locations}
                  onChange={(event) => setProfileForm({ ...profileForm, preferred_locations: event.target.value })}
                  placeholder="Remote, hybrid, specific cities, countries, relocation preferences..."
                />
              </label>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Strengths and Preferences</h3>
              </div>
              <label className="field">
                <span>Strongest skills</span>
                <textarea
                  rows="5"
                  value={profileForm.strongest_skills}
                  onChange={(event) => setProfileForm({ ...profileForm, strongest_skills: event.target.value })}
                  placeholder="React, TypeScript, UI systems, product thinking, backend APIs..."
                />
              </label>
              <label className="field">
                <span>Work style preferences</span>
                <textarea
                  rows="4"
                  value={profileForm.work_style_preferences}
                  onChange={(event) => setProfileForm({ ...profileForm, work_style_preferences: event.target.value })}
                  placeholder="Remote or hybrid, startup vs enterprise, ownership level, pace, team size..."
                />
              </label>
              <label className="field">
                <span>Outreach style</span>
                <textarea
                  rows="4"
                  value={profileForm.outreach_style}
                  onChange={(event) => setProfileForm({ ...profileForm, outreach_style: event.target.value })}
                  placeholder="Direct, concise, warm, high-volume, referral-first..."
                />
              </label>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Constraints</h3>
              </div>
              <label className="field">
                <span>Constraints</span>
                <textarea
                  rows="5"
                  value={profileForm.constraints}
                  onChange={(event) => setProfileForm({ ...profileForm, constraints: event.target.value })}
                  placeholder="Visa, timeline, notice period, domain limitations, interview availability..."
                />
              </label>
              <label className="field">
                <span>Industries to avoid</span>
                <textarea
                  rows="4"
                  value={profileForm.industries_to_avoid}
                  onChange={(event) => setProfileForm({ ...profileForm, industries_to_avoid: event.target.value })}
                  placeholder="Industries, company types, tech stacks, or roles you want to avoid..."
                />
              </label>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Extra Context</h3>
              </div>
              <label className="field">
                <span>Anything else Agent should remember</span>
                <textarea
                  rows="8"
                  value={profileForm.extra_context}
                  onChange={(event) => setProfileForm({ ...profileForm, extra_context: event.target.value })}
                  placeholder="Anything important that does not fit the other fields..."
                />
              </label>
              <button className="action-button primary" type="button" onClick={handleSaveProfile}>
                Save Profile
              </button>
            </div>
          </section>
        ) : null}

        {page === "Agent" ? (
          <section className="grid">
            <div className="panel chat-panel agent-chat-panel">
              <div className="chat-top-row">
                <span className={`sidebar-type-badge ${selectedThread?.thread_type === "general" ? "deep" : "job"}`}>
                  {selectedThread?.thread_type === "general" ? "Agent" : "Helper"}
                </span>
                <div className="chat-thread-actions">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showToolDebug}
                      onChange={(event) => setShowToolDebug(event.target.checked)}
                    />
                    Show tools
                  </label>
                  <button className="action-button subtle" type="button" onClick={handleClearThread}>
                    Clear Thread
                  </button>
                </div>
              </div>
              <div className="chat-log" ref={chatLogRef}>
                {combinedThreadMessages.length ? (
                  combinedThreadMessages.map((message) =>
                    message.role === "timeline_event" ? (
                      <div key={message.id} className="timeline-event">
                        <span>{message.content}</span>
                      </div>
                    ) : (
                      <div key={message.id} className={`chat-message ${message.role}`}>
                        <MarkdownMessage content={message.content} />
                      </div>
                    )
                  )
                ) : (
                  <div className="chat-empty-state">
                    <p className="chat-empty-title">
                      {selectedThread?.thread_type === "general"
                        ? "Start with Agent."
                        : "Start with this Helper."}
                    </p>
                    <p className="muted">
                      {selectedThread?.thread_type === "general"
                        ? "Ask for pipeline strategy, prioritization, follow-up planning, or a weekly search plan."
                        : "Ask about this specific role, resume fit, follow-ups, or interview prep."}
                    </p>
                  </div>
                )}
              </div>
              {pendingAction ? renderPendingActionPreview() : null}
              <div className="chat-quick-actions">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="quick-prompt"
                    onClick={() => setChatInput(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form className="chat-compose chat-compose-bar" onSubmit={handleSendChat}>
                <textarea
                  rows="3"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about your search strategy, a saved job, a follow-up, or an application update."
                />
                <button className="action-button primary" type="submit" disabled={sendingChat || !selectedThreadId}>
                  {sendingChat ? "Sending..." : "Send"}
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </main>

      {showNewJobAgentModal ? (
        <div className="modal-backdrop" onClick={() => setShowNewJobAgentModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="section-heading">
                <h3>New Helper</h3>
                <p>Select one saved job and one saved resume to start a focused chat.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowNewJobAgentModal(false)}
                aria-label="Close new job agent dialog"
              >
                x
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateJobThread}>
              <label className="field">
                <span>Job</span>
                <select
                  value={newThreadForm.job_id}
                  onChange={(event) => setNewThreadForm({ ...newThreadForm, job_id: event.target.value })}
                >
                  <option value="">Select a job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title || "Untitled"} | {job.company || "Unknown"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Resume</span>
                <select
                  value={newThreadForm.resume_id}
                  onChange={(event) =>
                    setNewThreadForm({ ...newThreadForm, resume_id: event.target.value })
                  }
                >
                  <option value="">Select a resume</option>
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      #{resume.id} | {resume.filename}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="action-button subtle"
                  onClick={() => setShowNewJobAgentModal(false)}
                >
                  Cancel
                </button>
                <button className="action-button primary" type="submit">
                  Start Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showSearchModal ? (
        <div className="modal-backdrop" onClick={() => setShowSearchModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Search Jobs</h3>
                <p className="muted">Run a saved search and attach the results to a new session.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowSearchModal(false)}>
                x
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSearch}>
              <label className="field">
                <span>Job title</span>
                <input
                  value={searchForm.job_title}
                  onChange={(event) => setSearchForm({ ...searchForm, job_title: event.target.value })}
                  placeholder="AI Engineer"
                />
              </label>
              <div className="inline-fields">
                <label className="field">
                  <span>Location</span>
                  <input
                    value={searchForm.location}
                    onChange={(event) => setSearchForm({ ...searchForm, location: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Work style</span>
                  <select
                    value={searchForm.work_style}
                    onChange={(event) => setSearchForm({ ...searchForm, work_style: event.target.value })}
                  >
                    <option>Any</option>
                    <option>Remote</option>
                    <option>Hybrid</option>
                    <option>Onsite</option>
                  </select>
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Results</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={searchForm.k}
                    onChange={(event) => setSearchForm({ ...searchForm, k: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Greenhouse board</span>
                  <input
                    value={searchForm.greenhouse_board}
                    onChange={(event) => setSearchForm({ ...searchForm, greenhouse_board: event.target.value })}
                    placeholder="greenhouse.io/acme"
                  />
                </label>
              </div>
              <label className="field">
                <span>Ashby board</span>
                <input
                  value={searchForm.ashby_board}
                  onChange={(event) => setSearchForm({ ...searchForm, ashby_board: event.target.value })}
                  placeholder="jobs.ashbyhq.com/acme"
                />
              </label>
              <div className="modal-actions">
                <button className="action-button" type="button" onClick={() => setShowSearchModal(false)}>
                  Cancel
                </button>
                <button className="action-button primary" type="submit" disabled={searching}>
                  {searching ? "Searching..." : "Search and Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showResumeUploadModal ? (
        <div className="modal-backdrop" onClick={() => setShowResumeUploadModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>New Resume</h3>
                <p className="muted">Upload a PDF or DOCX resume to save it for matching and helpers.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowResumeUploadModal(false)}>
                x
              </button>
            </div>
            <div className="modal-form">
              <label className="upload-box">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={async (event) => {
                    await handleResumeUpload(event);
                    setShowResumeUploadModal(false);
                  }}
                />
                <span>{uploadingResume ? "Uploading..." : "Choose a resume file"}</span>
              </label>
              <div className="modal-actions">
                <button className="action-button" type="button" onClick={() => setShowResumeUploadModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
