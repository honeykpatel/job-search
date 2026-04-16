import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const MOBILE_PAGES = ["Job Search", "Resume", "Matching", "Applications", "Profile", "Agent"];
const DESKTOP_PAGES = ["Job Search", "Resume", "Matching", "Applications", "Profile", "Helpers"];
const DESKTOP_BREAKPOINT = 1180;
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
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.adminToken ? { "X-Admin-Token": options.adminToken } : {}),
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

function AuthShell({
  mode,
  form,
  loading,
  error,
  onModeChange,
  onChange,
  onSubmit,
  onOpenAdmin,
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="status-pill">Private workspace</span>
        <h1>Job Pilot</h1>
        <p className="muted">
          Sign in to access your own search sessions, resumes, applications, Agent, and Helpers.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange({ ...form, email: event.target.value })}
              autoComplete="email"
              required
            />
          </label>
          {mode === "sign-up" ? (
            <>
              <div className="inline-fields">
                <label className="field">
                  <span>First Name</span>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(event) => onChange({ ...form, first_name: event.target.value })}
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className="field">
                  <span>Last Name</span>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(event) => onChange({ ...form, last_name: event.target.value })}
                    autoComplete="family-name"
                    required
                  />
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Username</span>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(event) => onChange({ ...form, username: event.target.value })}
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="field">
                  <span>Phone Number</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => onChange({ ...form, phone: event.target.value })}
                    autoComplete="tel"
                    required
                  />
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Age</span>
                  <input
                    type="number"
                    min="13"
                    max="120"
                    value={form.age}
                    onChange={(event) => onChange({ ...form, age: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Gender</span>
                  <select value={form.gender} onChange={(event) => onChange({ ...form, gender: event.target.value })}>
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
            />
          </label>
          {mode === "sign-up" ? (
            <label className="field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => onChange({ ...form, confirmPassword: event.target.value })}
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}
          <button className="action-button primary" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </form>
        <button
          className="action-button subtle"
          type="button"
          onClick={() => onModeChange(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <button className="action-button subtle" type="button" onClick={onOpenAdmin}>
          Admin Login
        </button>
      </section>
    </main>
  );
}

function AdminAuthShell({ form, loading, error, onChange, onSubmit, onBackToUser }) {
  return (
    <main className="auth-shell">
      <section className="auth-card admin-auth-card">
        <span className="status-pill">Restricted</span>
        <h1>Admin Access</h1>
        <p className="muted">
          Sign in with the admin username and password configured on the backend.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={form.username}
              onChange={(event) => onChange({ ...form, username: event.target.value })}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="action-button primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Admin Login"}
          </button>
        </form>
        <button className="action-button subtle" type="button" onClick={onBackToUser}>
          Back to User Login
        </button>
      </section>
    </main>
  );
}

function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }
  return new Date(value).toLocaleString();
}

function NotificationPopup({ type, message, onDismiss }) {
  if (!message) {
    return null;
  }

  return (
    <div className="notification-overlay" role="presentation">
      <div
        className={`notification-popup ${type === "error" ? "error" : "success"}`}
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
      >
        <div className="notification-copy">
          <strong>{type === "error" ? "Error" : "Notification"}</strong>
          <p>{message}</p>
        </div>
        <button className="action-button primary notification-dismiss" type="button" onClick={onDismiss}>
          OK
        </button>
      </div>
    </div>
  );
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

function emptyAccountForm() {
  return {
    first_name: "",
    last_name: "",
    username: "",
    phone: "",
    age: "",
    gender: "",
  };
}

function emptyAuthForm() {
  return {
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
    username: "",
    phone: "",
    age: "",
    gender: "",
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function isStrongPassword(value) {
  const password = String(value || "");
  return password.length >= 6 && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9_]{3,24}$/.test(String(value || "").trim());
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
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
      <strong>{value}</strong>
      <span>{label}</span>
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

function formatAdminCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function AppIcon({ name }) {
  const icons = {
    menu: (
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    close: (
      <path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    chevronLeft: (
      <path
        d="m14.5 5-7 7 7 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    chevronRight: (
      <path
        d="m9.5 5 7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    chevronDown: (
      <path
        d="m6 9 6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    chevronUp: (
      <path
        d="m6 15 6-6 6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    ),
    more: (
      <>
        <circle cx="6.5" cy="12" r="1.4" fill="currentColor" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        <circle cx="17.5" cy="12" r="1.4" fill="currentColor" />
      </>
    ),
    send: <path d="M3 20 21 12 3 4l3.6 6.2L14 12l-7.4 1.8Z" fill="currentColor" />,
  };

  return (
    <svg className="ui-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function parseHelperInsightsMessage(message) {
  if (message?.role !== "tool") {
    return null;
  }
  try {
    const payload = JSON.parse(String(message.content || ""));
    return payload?.kind === "helper_insights" ? payload : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname || "/");
  const [authMode, setAuthMode] = useState("sign-in");
  const [authForm, setAuthForm] = useState(emptyAuthForm());
  const [adminAuthForm, setAdminAuthForm] = useState({ username: "", password: "" });
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [session, setSession] = useState(null);
  const [adminSession, setAdminSession] = useState(null);
  const [authConfigError, setAuthConfigError] = useState("");
  const [page, setPage] = useState("Job Search");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessions, setSessions] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [threads, setThreads] = useState([]);
  const [profile, setProfile] = useState({ summary_text: "" });
  const [profileForm, setProfileForm] = useState(emptyProfileForm());
  const [accountForm, setAccountForm] = useState(emptyAccountForm());
  const [savingAccount, setSavingAccount] = useState(false);
  const [pipelineSummary, setPipelineSummary] = useState(null);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [adminTables, setAdminTables] = useState([]);
  const [selectedAdminTable, setSelectedAdminTable] = useState("");
  const [adminTableData, setAdminTableData] = useState(null);
  const [adminTableSearch, setAdminTableSearch] = useState("");
  const [adminTableOffset, setAdminTableOffset] = useState(0);
  const [adminEditorMode, setAdminEditorMode] = useState(null);
  const [adminEditorValues, setAdminEditorValues] = useState({});
  const [adminEditorPrimaryKey, setAdminEditorPrimaryKey] = useState({});
  const [adminSaving, setAdminSaving] = useState(false);

  const [searchForm, setSearchForm] = useState({
    job_title: "",
    location: "",
    work_style: "Any",
    k: 5,
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
  const [agentThread, setAgentThread] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [timelineEventsByThread, setTimelineEventsByThread] = useState({});
  const [showToolDebug, setShowToolDebug] = useState(false);
  const [newThreadForm, setNewThreadForm] = useState({ job_id: "", resume_id: "" });
  const [showNewJobAgentModal, setShowNewJobAgentModal] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [openSidebarItemMenu, setOpenSidebarItemMenu] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => window.innerWidth > DESKTOP_BREAKPOINT);
  const [isDesktopAgentCollapsed, setIsDesktopAgentCollapsed] = useState(false);
  const [mobileAgentTab, setMobileAgentTab] = useState("agent");
  const [chatInput, setChatInput] = useState("");
  const [agentChatInput, setAgentChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [sendingAgentChat, setSendingAgentChat] = useState(false);
  const [activeHelperInsight, setActiveHelperInsight] = useState(null);
  const [showHelperInsightsBar, setShowHelperInsightsBar] = useState(true);
  const [helperInsightsByThreadId, setHelperInsightsByThreadId] = useState({});
  const [helperInsightsMetaByThreadId, setHelperInsightsMetaByThreadId] = useState({});
  const chatLogRef = useRef(null);
  const agentChatLogRef = useRef(null);
  const chatInputRef = useRef(null);
  const agentChatInputRef = useRef(null);
  const helperInsightsScrollRef = useRef({ top: 0 });
  const suppressHelperInsightsAutoHideRef = useRef(false);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  function syncHelperInsightsVisibility(chatLog, { forceVisible = false } = {}) {
    if (!chatLog) {
      return;
    }
    const nextTop = chatLog.scrollTop;
    const overflowHeight = chatLog.scrollHeight - chatLog.clientHeight;
    const hasEnoughChat = overflowHeight > 120;

    helperInsightsScrollRef.current = { top: nextTop };

    if (!hasEnoughChat) {
      setShowHelperInsightsBar(true);
      return;
    }

    if (forceVisible) {
      setShowHelperInsightsBar(true);
    }
  }

  function resizeComposerTextarea(textarea) {
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 24), 120);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 120 ? "auto" : "hidden";
  }

  async function enforceVerifiedSession(client, nextSession) {
    if (!nextSession?.user) {
      setSession(null);
      return;
    }
    if (nextSession.user.email_confirmed_at) {
      setSession(nextSession);
      return;
    }
    await client.auth.signOut();
    setSession(null);
    setError("Verify your email before signing in.");
  }

  function navigateTo(nextPath) {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPathname(window.location.pathname || nextPath);
  }

  function closeMobileSidebar() {
    setIsMobileSidebarOpen(false);
  }

  useEffect(() => {
    try {
      const savedAdminSession = window.localStorage.getItem("jobpilot_admin_session");
      if (savedAdminSession) {
        setAdminSession(JSON.parse(savedAdminSession));
      }
    } catch {
      window.localStorage.removeItem("jobpilot_admin_session");
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || "/");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth > DESKTOP_BREAKPOINT);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!error && !notice && !authConfigError) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setError("");
      setNotice("");
      setAuthConfigError("");
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error, notice, authConfigError]);

  useEffect(() => {
    const shouldLockBody = isMobileSidebarOpen && window.innerWidth <= DESKTOP_BREAKPOINT;
    document.body.classList.toggle("sidebar-open", shouldLockBody);

    return () => {
      document.body.classList.remove("sidebar-open");
    };
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (isDesktopViewport) {
      setIsMobileSidebarOpen(false);
    } else {
      setIsDesktopAgentCollapsed(false);
    }
  }, [isDesktopViewport]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe = null;

    void (async () => {
      try {
        const config = await api("/api/auth/config");
        if (!isActive) {
          return;
        }
        const client = createClient(config.supabase_url, config.supabase_anon_key);
        const sessionResult = await client.auth.getSession();
        if (!isActive) {
          return;
        }
        setSupabaseClient(client);
        await enforceVerifiedSession(client, sessionResult.data.session || null);
        setAuthConfigError("");

        const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
          void enforceVerifiedSession(client, nextSession || null);
        });
        unsubscribe = () => listener.subscription.unsubscribe();

        setAuthLoading(false);
      } catch (err) {
        if (!isActive) {
          return;
        }
        setAuthConfigError(err.message);
        setAuthLoading(false);
      }
      return undefined;
    })();

    return () => {
      isActive = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token) {
      setSessions([]);
      setResumes([]);
      setJobs([]);
      setThreads([]);
      setProfile({ summary_text: "" });
      setProfileForm(emptyProfileForm());
      setAccountForm(emptyAccountForm());
      setPipelineSummary(null);
      setSelectedSessionId(null);
      setSelectedResumeId(null);
      setSelectedResume(null);
      setSelectedThreadId(null);
      setSelectedThread(null);
      setPendingAction(null);
      return;
    }
    void bootstrap(session.access_token);
  }, [session?.access_token]);

  useEffect(() => {
    if (!adminSession?.token) {
      setAdminTables([]);
      setSelectedAdminTable("");
      setAdminTableData(null);
      setAdminEditorMode(null);
      setAdminEditorValues({});
      setAdminEditorPrimaryKey({});
      window.localStorage.removeItem("jobpilot_admin_session");
      if (page === "Admin" && !isAdminRoute) {
        setPage("Job Search");
      }
      return;
    }

    window.localStorage.setItem("jobpilot_admin_session", JSON.stringify(adminSession));
    if (!session?.access_token) {
      setPage("Admin");
    }
    void loadAdminTables(adminSession.token);
  }, [adminSession, isAdminRoute, page, session?.access_token]);

  useEffect(() => {
    if (isAdminRoute) {
      if (page !== "Admin") {
        setPage("Admin");
      }
      return;
    }

    if (page === "Admin" && session?.access_token) {
      setPage("Job Search");
    }
  }, [isAdminRoute, page, session?.access_token]);

  useEffect(() => {
    if (adminSession?.token && !session?.access_token && !isAdminRoute) {
      navigateTo("/admin");
    }
  }, [adminSession?.token, isAdminRoute, session?.access_token]);

  useEffect(() => {
    if (!adminSession?.token || !selectedAdminTable) {
      setAdminTableData(null);
      return;
    }
    void loadAdminTable(selectedAdminTable);
  }, [adminSession?.token, selectedAdminTable, adminTableOffset]);

  useEffect(() => {
    if (!session?.access_token) {
      setSelectedSessionJobs([]);
      setSelectedSessionJobId("");
      return;
    }
    if (!selectedSessionId) {
      setSelectedSessionJobs([]);
      setSelectedSessionJobId("");
      return;
    }

    void (async () => {
      try {
        setError("");
        const data = await api(`/api/sessions/${selectedSessionId}/jobs`, { accessToken: session?.access_token });
        setSelectedSessionJobs(data);
        setSelectedSessionJobId((current) => (data.some((job) => job.id === current) ? current : (data[0]?.id || "")));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [selectedSessionId]);

  useEffect(() => {
    if (!session?.access_token) {
      setSelectedResume(null);
      return;
    }
    if (!selectedResumeId) {
      setSelectedResume(null);
      return;
    }

    void (async () => {
      try {
        setError("");
        const data = await api(`/api/resumes/${selectedResumeId}`, { accessToken: session?.access_token });
        setSelectedResume(data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [selectedResumeId]);

  useEffect(() => {
    if (session?.access_token) {
      void loadApplicationJobs();
    }
  }, [applicationQuery, applicationStatusFilter, applicationLimit, session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setSelectedThread(null);
      setAgentThread(null);
      setPendingAction(null);
      return;
    }
    if (!selectedThreadId) {
      setSelectedThread(null);
      setPendingAction(null);
      return;
    }
    void loadThread(selectedThreadId);
    setPendingAction(null);
  }, [selectedThreadId, session?.access_token]);

  useEffect(() => {
    const shouldShowDesktopAgentRail = isDesktopViewport && !!session?.access_token && !isAdminRoute;
    const nextMainAgentThread = threads.find((thread) => thread.thread_type === "general") || null;
    if (!shouldShowDesktopAgentRail || !nextMainAgentThread?.id) {
      return;
    }
    void loadAgentThread(nextMainAgentThread.id);
  }, [threads, session?.access_token, isDesktopViewport, isAdminRoute]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog || (page !== "Agent" && page !== "Helpers")) {
      return;
    }

    const shouldKeepHelperInsightsVisible =
      page === "Helpers" &&
      isDesktopViewport &&
      selectedThread?.thread_type &&
      selectedThread.thread_type !== "general";
    if (shouldKeepHelperInsightsVisible) {
      suppressHelperInsightsAutoHideRef.current = true;
    }

    const rafId = window.requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
      if (shouldKeepHelperInsightsVisible) {
        syncHelperInsightsVisibility(chatLog, { forceVisible: true });
      }
    });

    let releaseId = null;
    if (shouldKeepHelperInsightsVisible) {
      releaseId = window.requestAnimationFrame(() => {
        suppressHelperInsightsAutoHideRef.current = false;
        syncHelperInsightsVisibility(chatLog, { forceVisible: true });
      });
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      if (releaseId) {
        window.cancelAnimationFrame(releaseId);
      }
    };
  }, [page, mobileAgentTab, selectedThreadId, selectedThread?.messages, sendingChat, isDesktopViewport, selectedThread?.thread_type]);

  useEffect(() => {
    resizeComposerTextarea(chatInputRef.current);
  }, [chatInput]);

  useEffect(() => {
    const chatLog = agentChatLogRef.current;
    const shouldShowDesktopAgentRail = isDesktopViewport && !!session?.access_token && !isAdminRoute;
    if (!chatLog || !shouldShowDesktopAgentRail) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [agentThread?.messages, sendingAgentChat, isDesktopViewport, session?.access_token, isAdminRoute]);

  useEffect(() => {
    resizeComposerTextarea(agentChatInputRef.current);
  }, [agentChatInput]);

  useEffect(() => {
    setActiveHelperInsight(null);
    setShowHelperInsightsBar(true);
    helperInsightsScrollRef.current = { top: 0 };
    suppressHelperInsightsAutoHideRef.current = false;
  }, [selectedThreadId]);

  useEffect(() => {
    if (page !== "Helpers" || !isDesktopViewport || selectedThread?.thread_type === "general") {
      return;
    }
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      syncHelperInsightsVisibility(chatLog, { forceVisible: true });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [page, isDesktopViewport, selectedThreadId, helperInsightsMetaByThreadId, selectedThread?.thread_type]);

  useEffect(() => {
    if (
      !session?.access_token ||
      !selectedThreadId ||
      page !== "Helpers" ||
      !isDesktopViewport ||
      !selectedThread?.thread_type ||
      selectedThread.thread_type === "general" ||
      (selectedThread.messages || []).some((message) => parseHelperInsightsMessage(message))
    ) {
      return;
    }

    let cancelled = false;
    void api(`/api/threads/${selectedThreadId}/helper-insights`, {
      method: "POST",
      accessToken: session.access_token,
    })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setHelperInsightsMetaByThreadId((current) => ({
          ...current,
          [selectedThreadId]: {
            status: data?.status || (data?.insights ? "ready" : "idle"),
            error: data?.error || null,
          },
        }));
        setHelperInsightsByThreadId((current) => {
          if (!data?.insights) {
            return current;
          }
          return { ...current, [selectedThreadId]: data.insights };
        });
        setSelectedThread((current) => (current ? { ...current, messages: data.messages || current.messages } : current));
      })
      .catch((err) => {
        if (!cancelled) {
          setHelperInsightsMetaByThreadId((current) => ({
            ...current,
            [selectedThreadId]: {
              status: "failed",
              error: err.message,
            },
          }));
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [page, isDesktopViewport, selectedThreadId, selectedThread, session?.access_token]);

  async function bootstrap(accessToken) {
    try {
      setError("");
      let [sessionData, resumeData, recentJobs, threadData, profileData, pipelineData, accountData] = await Promise.all([
        api("/api/sessions", { accessToken }),
        api("/api/resumes", { accessToken }),
        api("/api/jobs/recent?limit=200", { accessToken }),
        api("/api/threads", { accessToken }),
        api("/api/profile", { accessToken }),
        api("/api/pipeline-summary", { accessToken }),
        api("/api/account", { accessToken }),
      ]);
      accountData = await ensureAccountProfile(accessToken, accountData);
      if (!threadData.some((thread) => thread.thread_type === "general")) {
        const deepAgentThread = await api("/api/threads/general", { method: "POST", accessToken });
        threadData = [deepAgentThread, ...threadData];
      }
      setSessions(sessionData);
      setResumes(resumeData);
      setJobs(recentJobs);
      setThreads(threadData);
      setProfile(profileData || { summary_text: "" });
      setProfileForm(parseProfileSummary((profileData || {}).summary_text || ""));
      setAccountForm({
        first_name: accountData?.first_name || session.user?.user_metadata?.first_name || "",
        last_name: accountData?.last_name || session.user?.user_metadata?.last_name || "",
        username: accountData?.username || session.user?.user_metadata?.username || "",
        phone: accountData?.phone || session.user?.user_metadata?.phone || "",
        age: accountData?.age ? String(accountData.age) : session.user?.user_metadata?.age ? String(session.user.user_metadata.age) : "",
        gender: accountData?.gender || session.user?.user_metadata?.gender || "",
      });
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
    const accessToken = session?.access_token;
    let [sessionData, resumeData, recentJobs, threadData, pipelineData, profileData, accountData] = await Promise.all([
      api("/api/sessions", { accessToken }),
      api("/api/resumes", { accessToken }),
      api("/api/jobs/recent?limit=200", { accessToken }),
      api("/api/threads", { accessToken }),
      api("/api/pipeline-summary", { accessToken }),
      api("/api/profile", { accessToken }),
      api("/api/account", { accessToken }),
    ]);
    accountData = await ensureAccountProfile(accessToken, accountData);
    if (!threadData.some((thread) => thread.thread_type === "general")) {
      const deepAgentThread = await api("/api/threads/general", { method: "POST", accessToken });
      threadData = [deepAgentThread, ...threadData];
    }
    const nextSelectedSessionId =
      selectedSessionId && sessionData.some((session) => session.id === selectedSessionId)
        ? selectedSessionId
        : null;
    setSessions(sessionData);
    setResumes(resumeData);
    setJobs(recentJobs);
    setThreads(threadData);
    setPipelineSummary(pipelineData);
    setProfile(profileData || { summary_text: "" });
    setProfileForm(parseProfileSummary((profileData || {}).summary_text || ""));
    setAccountForm((current) => ({
      ...current,
      first_name: accountData?.first_name || session?.user?.user_metadata?.first_name || "",
      last_name: accountData?.last_name || session?.user?.user_metadata?.last_name || "",
      username: accountData?.username || session?.user?.user_metadata?.username || "",
      phone: accountData?.phone || session?.user?.user_metadata?.phone || "",
      age: accountData?.age ? String(accountData.age) : session?.user?.user_metadata?.age ? String(session.user.user_metadata.age) : "",
      gender: accountData?.gender || session?.user?.user_metadata?.gender || "",
    }));
    setSelectedSessionId(nextSelectedSessionId);
    setSelectedThreadId((current) =>
      current && threadData.some((thread) => thread.id === current) ? current : null
    );
    if (nextSelectedSessionId) {
      const sessionJobs = await api(`/api/sessions/${nextSelectedSessionId}/jobs`, { accessToken });
      setSelectedSessionJobs(sessionJobs);
      setSelectedSessionJobId((current) =>
        sessionJobs.some((job) => job.id === current) ? current : (sessionJobs[0]?.id || "")
      );
    } else {
      setSelectedSessionJobs([]);
      setSelectedSessionJobId("");
    }
    await loadApplicationJobs();
  }

  async function fetchThread(threadId) {
    return api(`/api/threads/${threadId}`, { accessToken: session?.access_token });
  }

  async function ensureAccountProfile(accessToken, accountData) {
    const metadata = session?.user?.user_metadata || {};
    if (
      !accessToken ||
      accountData?.username ||
      !metadata.first_name ||
      !metadata.last_name ||
      !metadata.username ||
      !metadata.phone
    ) {
      return accountData;
    }

    try {
      return await api("/api/account", {
        method: "PUT",
        body: JSON.stringify({
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          username: metadata.username,
          phone: metadata.phone,
          age: metadata.age || null,
          gender: metadata.gender || "",
        }),
        accessToken,
      });
    } catch {
      return accountData;
    }
  }

  async function loadThread(threadId) {
    try {
      setError("");
      const data = await fetchThread(threadId);
      if (data?.helper_insights) {
        setHelperInsightsByThreadId((current) => ({ ...current, [threadId]: data.helper_insights }));
      }
      if (data?.thread_type && data.thread_type !== "general") {
        setHelperInsightsMetaByThreadId((current) => ({
          ...current,
          [threadId]: {
            status: data.helper_insights_status || (data.helper_insights ? "ready" : "idle"),
            error: data.helper_insights_error || null,
          },
        }));
      }
      setSelectedThread(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAgentThread(threadId) {
    try {
      setError("");
      const data = await fetchThread(threadId);
      setAgentThread(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAdminTables(token = adminSession?.token) {
    if (!token) {
      return;
    }
    try {
      setError("");
      const data = await api("/api/admin/tables", { adminToken: token });
      setAdminTables(data || []);
      setSelectedAdminTable((current) => {
        if (current && data.some((table) => table.name === current)) {
          return current;
        }
        return data[0]?.name || "";
      });
    } catch (err) {
      setError(err.message);
      if (String(err.message).toLowerCase().includes("admin")) {
        setAdminSession(null);
      }
    }
  }

  async function loadAdminTable(tableName, nextSearch = adminTableSearch, nextOffset = adminTableOffset) {
    if (!adminSession?.token || !tableName) {
      return;
    }
    try {
      setError("");
      const params = new URLSearchParams({
        limit: "100",
        offset: String(nextOffset),
      });
      if ((nextSearch || "").trim()) {
        params.set("search", nextSearch.trim());
      }
      const data = await api(`/api/admin/tables/${tableName}?${params.toString()}`, {
        adminToken: adminSession.token,
      });
      setAdminTableData(data);
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
      const data = await api(`/api/jobs?${params.toString()}`, { accessToken: session?.access_token });
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
        accessToken: session?.access_token,
      });
      setSearchResult(data);
      if (data.jobs.length) {
        setNotice(`Saved search with ${data.jobs.length} jobs.`);
        setSelectedSessionId(data.session_id);
      } else {
        setNotice("No jobs found for that search.");
        setSelectedSessionId(null);
      }
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
      const resume = await api("/api/resumes", { method: "POST", body: formData, accessToken: session?.access_token });
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
      const data = await api(`/api/matches?${params.toString()}`, { accessToken: session?.access_token });
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
        accessToken: session?.access_token,
      });
      setProfile(saved);
      setProfileForm(parseProfileSummary(saved.summary_text || ""));
      setNotice("Agent context saved.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveAccount() {
    if (!session?.access_token || !supabaseClient) {
      return;
    }
    if (!accountForm.first_name.trim() || !accountForm.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (!isValidUsername(accountForm.username)) {
      setError("Username must be 3-24 characters and use only letters, numbers, or underscores.");
      return;
    }
    if (!/^\d{10}$/.test(normalizePhoneDigits(accountForm.phone))) {
      setError("Phone number must contain exactly 10 digits including area code.");
      return;
    }
    if (accountForm.age && (Number(accountForm.age) < 13 || Number(accountForm.age) > 120)) {
      setError("Age must be between 13 and 120.");
      return;
    }

    try {
      setSavingAccount(true);
      setError("");
      const savedAccount = await api("/api/account", {
        method: "PUT",
        body: JSON.stringify({
          first_name: accountForm.first_name,
          last_name: accountForm.last_name,
          username: accountForm.username,
          phone: normalizePhoneDigits(accountForm.phone),
          age: accountForm.age ? Number(accountForm.age) : null,
          gender: accountForm.gender,
        }),
        accessToken: session.access_token,
      });

      const { error: updateError } = await supabaseClient.auth.updateUser({
        data: {
          first_name: savedAccount.first_name,
          last_name: savedAccount.last_name,
          full_name: savedAccount.full_name,
          username: savedAccount.username,
          phone: savedAccount.phone,
          age: savedAccount.age,
          gender: savedAccount.gender,
        },
      });
      if (updateError) {
        throw updateError;
      }

      setAccountForm({
        first_name: savedAccount.first_name || "",
        last_name: savedAccount.last_name || "",
        username: savedAccount.username || "",
        phone: savedAccount.phone || "",
        age: savedAccount.age ? String(savedAccount.age) : "",
        gender: savedAccount.gender || "",
      });
      setNotice("Account settings updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleSendPasswordReset() {
    if (!supabaseClient || !session?.user?.email) {
      return;
    }
    try {
      setError("");
      const { error: resetError } = await supabaseClient.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: window.location.origin,
      });
      if (resetError) {
        throw resetError;
      }
      setNotice("Password reset link sent to your email.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateGeneralThread() {
    try {
      setError("");
      const thread = await api("/api/threads/general", { method: "POST", accessToken: session?.access_token });
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
        accessToken: session?.access_token,
      });
      await refreshCollections();
      setSelectedThreadId(thread.id);
      setNewThreadForm({ job_id: "", resume_id: "" });
      setShowNewJobAgentModal(false);
      setPage(showDesktopAgentRail ? "Helpers" : "Agent");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSendChat(event) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!selectedThreadId || !content) {
      return;
    }

    const optimisticMessage = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    try {
      setSendingChat(true);
      setError("");
      setSelectedThread((current) => ({
        ...(current || {}),
        messages: [...(current?.messages || []), optimisticMessage],
      }));
      setChatInput("");
      const response = await api(`/api/threads/${selectedThreadId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          show_tool_debug: showToolDebug,
        }),
        accessToken: session?.access_token,
      });
      setSelectedThread((current) => ({ ...(current || {}), messages: response.messages }));
      setPendingAction(response.pending_action || null);
      await refreshCollections();
    } catch (err) {
      setSelectedThread((current) => ({
        ...(current || {}),
        messages: (current?.messages || []).filter((message) => message.id !== optimisticMessage.id),
      }));
      setChatInput(content);
      setError(err.message);
    } finally {
      setSendingChat(false);
    }
  }

  async function handleSendAgentChat(event) {
    event.preventDefault();
    const content = agentChatInput.trim();
    if (!mainAgentThread?.id || !content) {
      return;
    }

    const optimisticMessage = {
      id: `pending-agent-user-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    try {
      setSendingAgentChat(true);
      setError("");
      setAgentThread((current) => ({
        ...(current || {}),
        messages: [...(current?.messages || []), optimisticMessage],
      }));
      setAgentChatInput("");
      const response = await api(`/api/threads/${mainAgentThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content,
          show_tool_debug: showToolDebug,
        }),
        accessToken: session?.access_token,
      });
      setAgentThread((current) => ({ ...(current || {}), messages: response.messages }));
      await refreshCollections();
    } catch (err) {
      setAgentThread((current) => ({
        ...(current || {}),
        messages: (current?.messages || []).filter((message) => message.id !== optimisticMessage.id),
      }));
      setAgentChatInput(content);
      setError(err.message);
    } finally {
      setSendingAgentChat(false);
    }
  }

  async function handleClearThread() {
    if (!selectedThreadId) {
      return;
    }

    try {
      setError("");
      await api(`/api/threads/${selectedThreadId}/clear`, { method: "POST", accessToken: session?.access_token });
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
      await api(`/api/threads/${threadId}`, { method: "DELETE", accessToken: session?.access_token });
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

  async function handleRenameThread(threadId, currentTitle) {
    const nextTitle = window.prompt("Rename helper", currentTitle || "");
    if (!nextTitle || !nextTitle.trim()) {
      return;
    }

    try {
      setError("");
      await api(`/api/threads/${threadId}`, {
        method: "PUT",
        body: JSON.stringify({ title: nextTitle.trim() }),
        accessToken: session?.access_token,
      });
      setOpenSidebarItemMenu(null);
      await refreshCollections();
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
      await api(`/api/sessions/${sessionId}`, { method: "DELETE", accessToken: session?.access_token });
      setNotice("Deleted saved search and its related jobs, chats, and tracker data.");
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

  async function handleRenameSession(sessionId, currentTitle) {
    const nextTitle = window.prompt("Rename saved search", currentTitle || "");
    if (!nextTitle || !nextTitle.trim()) {
      return;
    }

    try {
      setError("");
      await api(`/api/sessions/${sessionId}`, {
        method: "PUT",
        body: JSON.stringify({ title: nextTitle.trim() }),
        accessToken: session?.access_token,
      });
      setOpenSidebarItemMenu(null);
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
      await api(`/api/resumes/${resumeId}`, { method: "DELETE", accessToken: session?.access_token });
      if (selectedResumeId === resumeId) {
        setSelectedResumeId(null);
      }
      setNotice(`Deleted resume #${resumeId}.`);
      await refreshCollections();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRenameResume(resumeId, currentTitle) {
    const nextTitle = window.prompt("Rename resume", currentTitle || "");
    if (!nextTitle || !nextTitle.trim()) {
      return;
    }

    try {
      setError("");
      await api(`/api/resumes/${resumeId}`, {
        method: "PUT",
        body: JSON.stringify({ title: nextTitle.trim() }),
        accessToken: session?.access_token,
      });
      setOpenSidebarItemMenu(null);
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
        accessToken: session?.access_token,
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

  function handleAdminCreateRow() {
    if (!adminTableData?.permissions?.can_create) {
      setNotice("");
      setError(adminTableData ? `Direct row creation is disabled for ${adminTableData.table}.` : "Select a table first.");
      return;
    }
    const nextValues = {};
    adminTableData.columns
      .filter((column) => column.creatable)
      .forEach((column) => {
      nextValues[column.name] = "";
      });
    setAdminEditorMode("create");
    setAdminEditorPrimaryKey({});
    setAdminEditorValues(nextValues);
  }

  function handleAdminEditRow(row) {
    if (!adminTableData) {
      return;
    }
    const nextValues = {};
    const nextPrimaryKey = {};
    adminTableData.columns.forEach((column) => {
      const rawValue = row[column.name];
      const normalized = rawValue === null || rawValue === undefined ? "" : String(rawValue);
      nextValues[column.name] = normalized;
      if (column.primary_key) {
        nextPrimaryKey[column.name] = rawValue;
      }
    });
    setAdminEditorMode("edit");
    setAdminEditorPrimaryKey(nextPrimaryKey);
    setAdminEditorValues(nextValues);
  }

  function adminRowMatchesSelection(row) {
    if (!adminTableData || !Object.keys(adminEditorPrimaryKey).length) {
      return false;
    }
    return adminTableData.columns
      .filter((column) => column.primary_key)
      .every((column) => row[column.name] === adminEditorPrimaryKey[column.name]);
  }

  function adminSelectionLabel() {
    const entries = Object.entries(adminEditorPrimaryKey || {});
    if (!entries.length) {
      return adminEditorMode === "create" ? "New row" : "No row selected";
    }
    return entries.map(([key, value]) => `${key}=${formatAdminCellValue(value)}`).join(" | ");
  }

  async function handleAdminDeleteRow(row) {
    if (!adminSession?.token || !adminTableData) {
      return;
    }
    const primaryKey = {};
    adminTableData.columns
      .filter((column) => column.primary_key)
      .forEach((column) => {
        primaryKey[column.name] = row[column.name];
      });

    const confirmed = window.confirm(`Delete this row from ${adminTableData.table}?`);
    if (!confirmed) {
      return;
    }

    try {
      setAdminSaving(true);
      setError("");
      await api(`/api/admin/tables/${adminTableData.table}/rows`, {
        method: "DELETE",
        body: JSON.stringify({ primary_key: primaryKey }),
        adminToken: adminSession.token,
      });
      setNotice(`Deleted row from ${adminTableData.table}.`);
      if (adminRowMatchesSelection(row)) {
        setAdminEditorMode(null);
        setAdminEditorPrimaryKey({});
        setAdminEditorValues({});
      }
      await loadAdminTable(adminTableData.table);
      await loadAdminTables(adminSession.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleAdminSaveRow() {
    if (!adminSession?.token || !adminTableData || !adminEditorMode) {
      return;
    }

    try {
      setAdminSaving(true);
      setError("");
      const payload = { values: adminEditorValues };
      if (adminEditorMode === "edit") {
        await api(`/api/admin/tables/${adminTableData.table}/rows`, {
          method: "PUT",
          body: JSON.stringify({
            primary_key: adminEditorPrimaryKey,
            values: Object.fromEntries(
              Object.entries(adminEditorValues).filter(([key]) =>
                adminTableData.columns.some((column) => column.name === key && column.editable)
              )
            ),
          }),
          adminToken: adminSession.token,
        });
        setNotice(`Updated row in ${adminTableData.table}.`);
      } else {
        await api(`/api/admin/tables/${adminTableData.table}/rows`, {
          method: "POST",
          body: JSON.stringify({
            values: Object.fromEntries(
              Object.entries(payload.values).filter(([key]) =>
                adminTableData.columns.some((column) => column.name === key && column.creatable)
              )
            ),
          }),
          adminToken: adminSession.token,
        });
        setNotice(`Inserted row into ${adminTableData.table}.`);
      }
      setAdminEditorMode(null);
      setAdminEditorPrimaryKey({});
      setAdminEditorValues({});
      await loadAdminTable(adminTableData.table);
      await loadAdminTables(adminSession.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdminSaving(false);
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
        accessToken: session?.access_token,
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
  function buildCombinedThreadMessages(threadData, threadId) {
    const visibleMessages = (threadData?.messages || []).filter(
      (message) => !parseHelperInsightsMessage(message) && (showToolDebug || message.role !== "tool")
    );
    const threadEvents = timelineEventsByThread[threadId] || [];
    const combinedMessages = [];

    visibleMessages.forEach((message) => {
      combinedMessages.push(message);
      threadEvents
        .filter((event) => event.after_message_id === message.id)
        .forEach((event) => {
          combinedMessages.push(event);
        });
    });

    threadEvents
      .filter(
        (event) =>
          !event.after_message_id ||
          !visibleMessages.some((message) => message.id === event.after_message_id)
      )
      .forEach((event) => {
        if (!combinedMessages.some((item) => item.id === event.id)) {
          combinedMessages.push(event);
        }
      });

    return combinedMessages;
  }

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
  const mainAgentThread = threads.find((thread) => thread.thread_type === "general") || generalThreads[0] || null;
  const combinedThreadMessages = buildCombinedThreadMessages(selectedThread, selectedThreadId);
  const agentCombinedThreadMessages = buildCombinedThreadMessages(agentThread, mainAgentThread?.id);
  const jobsById = Object.fromEntries(jobs.map((job) => [job.id, job]));
  const resumesById = Object.fromEntries(resumes.map((resume) => [resume.id, resume]));
  const selectedSessionJob = selectedSessionJobs.find((job) => job.id === selectedSessionJobId) || selectedSessionJobs[0] || null;
  const bestMatchScore = matches.length ? Math.max(...matches.map((item) => Number(item.score || 0))) : null;
  const leastMatchScore = matches.length ? Math.min(...matches.map((item) => Number(item.score || 0))) : null;
  const showDesktopAgentRail = isDesktopViewport && !!session?.access_token && !isAdminRoute;
  const selectedHelperInsightsMeta =
    selectedThread?.thread_type && selectedThread.thread_type !== "general"
      ? helperInsightsMetaByThreadId[selectedThread.id] || {
          status: selectedThread?.helper_insights_status || (selectedThread?.helper_insights ? "ready" : "idle"),
          error: selectedThread?.helper_insights_error || null,
        }
      : null;
  const selectedHelperInsights =
    selectedThread?.thread_type && selectedThread.thread_type !== "general"
      ? selectedThread?.helper_insights ||
        helperInsightsByThreadId[selectedThread.id] ||
        (selectedThread?.messages || []).map(parseHelperInsightsMessage).find(Boolean) ||
        null
      : null;

  function renderDesktopHelperInsights() {
    if (!selectedThread || !isDesktopViewport || page !== "Helpers") {
      return null;
    }

    if (selectedHelperInsightsMeta?.status === "loading" && !selectedHelperInsights) {
      return (
        <div className={`helper-insights-shell ${showHelperInsightsBar ? "" : "hidden"}`}>
          <div className="helper-insight-panel" role="status" aria-live="polite">
            <div className="helper-insight-body">
              <p>Loading helper insights...</p>
            </div>
          </div>
        </div>
      );
    }

    if (selectedHelperInsightsMeta?.status === "failed" && !selectedHelperInsights) {
      return (
        <div className={`helper-insights-shell ${showHelperInsightsBar ? "" : "hidden"}`}>
          <div className="helper-insight-panel" role="status" aria-live="polite">
            <div className="helper-insight-body">
              <p>{selectedHelperInsightsMeta.error || "Helper insights could not be generated yet."}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!selectedHelperInsights) {
      return (
        <div className={`helper-insights-shell ${showHelperInsightsBar ? "" : "hidden"}`}>
          <div className="helper-insight-panel" role="status" aria-live="polite">
            <div className="helper-insight-body">
              <p>Helper insights are not ready yet.</p>
            </div>
          </div>
        </div>
      );
    }

    const insightCards = [
      {
        key: "cover-letter",
        label: "CoverLetter Draft",
        value: "100 words",
        content: (
          <div className="helper-insight-body helper-insight-copy">
            <p>{selectedHelperInsights.cover_letter_draft}</p>
            <button
              type="button"
              className="action-button subtle helper-insight-copy-button"
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  void navigator.clipboard.writeText(selectedHelperInsights.cover_letter_draft);
                  setNotice("Cover letter draft copied.");
                } else {
                  setError("Clipboard access is not available in this browser.");
                }
              }}
            >
              Copy Draft
            </button>
          </div>
        ),
      },
      {
        key: "skills-needed",
        label: "Skills Needed",
        value: `${selectedHelperInsights.skills_needed?.length || 0} priorities`,
        content: (
          <div className="helper-insight-body helper-skill-list">
            {selectedHelperInsights.skills_needed?.length ? (
              selectedHelperInsights.skills_needed.map((skill) => (
                <span key={skill} className="status-pill helper-skill-pill">
                  {skill}
                </span>
              ))
            ) : (
              <p className="muted">No strong skill signals were found in the job description yet.</p>
            )}
          </div>
        ),
      },
      {
        key: "skills-upgrade",
        label: "Skills to Upgrade",
        value: `${selectedHelperInsights.skills_to_upgrade?.length || 0} gaps`,
        content: (
          <div className="helper-insight-body helper-skill-list">
            {selectedHelperInsights.skills_to_upgrade?.length ? (
              selectedHelperInsights.skills_to_upgrade.map((skill) => (
                <span key={skill} className="status-pill helper-skill-pill muted-pill">
                  {skill}
                </span>
              ))
            ) : (
              <p className="muted">This resume already covers the main skills we could detect for the role.</p>
            )}
          </div>
        ),
      },
      {
        key: "match",
        label: "Match",
        value: `${selectedHelperInsights.match_percent || 0}%`,
        content: (
          <div className="helper-insight-body">
            <div className="helper-match-meter" aria-hidden="true">
              <span style={{ width: `${selectedHelperInsights.match_percent || 0}%` }} />
            </div>
            <p className="muted">
              Based on overlap between the helper job requirements and the saved resume/profile skills.
            </p>
          </div>
        ),
      },
    ];

    return (
      <div className={`helper-insights-shell ${showHelperInsightsBar ? "" : "hidden"}`}>
        <div className="helper-insights-bar" role="tablist" aria-label="Helper insights">
          {insightCards.map((card) => (
            <button
              key={card.key}
              type="button"
              role="tab"
              className={`helper-insight-toggle ${activeHelperInsight === card.key ? "active" : ""}`}
              aria-selected={activeHelperInsight === card.key}
              onClick={() => setActiveHelperInsight((current) => (current === card.key ? null : card.key))}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </button>
          ))}
        </div>
        {activeHelperInsight ? (
          <div className="helper-insight-panel" role="tabpanel">
            {insightCards.find((card) => card.key === activeHelperInsight)?.content}
          </div>
        ) : null}
      </div>
    );
  }
  useEffect(() => {
    if (isDesktopViewport || page !== "Agent") {
      return;
    }

    if (selectedThread?.thread_type === "general") {
      setMobileAgentTab("agent");
    } else if (selectedThread?.thread_type) {
      setMobileAgentTab("helper");
    }
  }, [isDesktopViewport, page, selectedThread?.thread_type]);

  function forwardScrollToChat(event) {
    if (!chatLogRef.current) {
      return;
    }
    event.preventDefault();
    chatLogRef.current.scrollTop += event.deltaY;
  }

  useEffect(() => {
    if (!showDesktopAgentRail || page !== "Agent") {
      return;
    }

    setPage("Job Search");
    navigateTo("/");
  }, [page, showDesktopAgentRail]);

  function renderHelperSidebarItems() {
    return (
      <>
        <div className="sidebar-inline-section">
          <span className="sidebar-group-label">Helpers</span>
          <button
            className="action-button primary sidebar-action"
            type="button"
            onClick={() => setShowNewJobAgentModal(true)}
          >
            New Helper
          </button>
        </div>

        <div className="sidebar-list">
          {jobThreads.length ? (
            jobThreads.map((thread) => {
              const job = jobsById[thread.job_id];
              const resume = resumesById[thread.resume_id];
              const helperTitle = `${job?.title || "Untitled"} @ ${job?.company || "Unknown"}`;
              const helperStatus = job?.application_status || "saved";
              const helperResume = resume?.filename || "No resume";
              const menuId = `thread-${thread.id}`;

              return (
                <div key={thread.id} className="sidebar-item-row sidebar-item-row-helper sidebar-item-row-flat">
                  <button
                    type="button"
                    className={`mini-button sidebar-item sidebar-helper-item ${selectedThreadId === thread.id ? "active" : ""}`}
                    onClick={() => {
                      if (showDesktopAgentRail) {
                        setPage("Helpers");
                      }
                      setSelectedThreadId(thread.id);
                      closeMobileSidebar();
                    }}
                    title={`${helperTitle} | ${helperResume}`}
                  >
                    <span className="sidebar-item-title">{helperTitle}</span>
                    <span className="sidebar-item-meta sidebar-helper-meta">
                      <span className="sidebar-type-badge status">{helperStatus}</span>
                      <span>{helperResume}</span>
                    </span>
                  </button>
                  <div className="sidebar-item-actions">
                    <button
                      type="button"
                      className={`icon-button sidebar-item-menu-trigger ${openSidebarItemMenu === menuId ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenSidebarItemMenu((current) => (current === menuId ? null : menuId));
                      }}
                      aria-label={`Open helper actions for ${helperTitle}`}
                    >
                      <AppIcon name="more" />
                    </button>
                    {openSidebarItemMenu === menuId ? (
                      <div className="sidebar-item-menu">
                        <button
                          type="button"
                          className="sidebar-item-menu-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRenameThread(thread.id, helperTitle);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="sidebar-item-menu-button destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteThread(thread.id);
                            setOpenSidebarItemMenu(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="sidebar-empty">No helpers yet.</p>
          )}
        </div>
      </>
    );
  }

  function renderMobileHelperList() {
    return (
      <div className="mobile-helper-list">
        {jobThreads.length ? (
          jobThreads.map((thread) => {
            const job = jobsById[thread.job_id];
            const resume = resumesById[thread.resume_id];
            const helperTitle = `${job?.title || "Untitled"} @ ${job?.company || "Unknown"}`;
            const helperResume = resume?.filename || "No resume";

            return (
              <button
                key={thread.id}
                type="button"
                className={`mobile-helper-button ${selectedThreadId === thread.id ? "active" : ""}`}
                onClick={() => setSelectedThreadId(thread.id)}
              >
                <span className="mobile-helper-title">{helperTitle}</span>
                <span className="mobile-helper-meta">{helperResume}</span>
              </button>
            );
          })
        ) : (
          <div className="chat-empty-state mobile-helper-empty">
            <p className="chat-empty-title">No helpers yet.</p>
            <p className="muted">Create a helper from a saved job and resume to start focused role-specific chats.</p>
          </div>
        )}
      </div>
    );
  }

  function renderAgentPanel({
    isDesktopRail = false,
    thread = selectedThread,
    threadId = selectedThreadId,
    messages = combinedThreadMessages,
    inputValue = chatInput,
    setInputValue = setChatInput,
    onSubmit = handleSendChat,
    sending = sendingChat,
    logRef = chatLogRef,
    inputRef = chatInputRef,
  } = {}) {
    const isMobileAgentView = !isDesktopRail && !isDesktopViewport;
    const showingMobileHelperTab = isMobileAgentView && mobileAgentTab === "helper";
    const showingSelectedMobileHelper =
      showingMobileHelperTab && thread?.thread_type && thread?.thread_type !== "general";
    const showMobileHelperList = showingMobileHelperTab && !showingSelectedMobileHelper;
    const showChatBody = !showingMobileHelperTab || showingSelectedMobileHelper;
    const showAgentHighlight =
      thread?.thread_type === "general" && (!isMobileAgentView || mobileAgentTab === "agent");
    const showThinkingState = sending && showChatBody;
    const showDesktopHelperHeader = !isDesktopRail && !isMobileAgentView && thread?.thread_type !== "general";
    const threadJob = jobsById[thread?.job_id];
    const threadResume = resumesById[thread?.resume_id];
    const helperHeaderTitle = thread?.title || `${threadJob?.title || "Untitled"} @ ${threadJob?.company || "Unknown"}`;
    const helperHeaderResume = threadResume?.filename || "No resume";
    const quickPrompts =
      thread?.thread_type === "general"
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
    const marqueePrompts = [...quickPrompts, ...quickPrompts];
    const showPendingAction = pendingAction && threadId === selectedThreadId;

    function handleChatLogScroll(event) {
      if (!showDesktopHelperHeader) {
        return;
      }
      const chatLog = event.currentTarget;
      const nextTop = chatLog.scrollTop;
      if (suppressHelperInsightsAutoHideRef.current) {
        syncHelperInsightsVisibility(chatLog, { forceVisible: true });
        return;
      }
      const { top: previousTop } = helperInsightsScrollRef.current;
      const overflowHeight = chatLog.scrollHeight - chatLog.clientHeight;
      const hasEnoughChat = overflowHeight > 120;

      if (!hasEnoughChat || nextTop < 12) {
        setShowHelperInsightsBar(true);
      } else if (nextTop > previousTop) {
        setShowHelperInsightsBar(false);
      } else if (nextTop < previousTop) {
        setShowHelperInsightsBar(true);
      }

      syncHelperInsightsVisibility(chatLog);
    }

    return (
      <div
        className={`panel chat-panel agent-chat-panel ${showAgentHighlight ? "agent-chat-panel-agent" : ""} ${
          thread?.thread_type !== "general" ? "helper-chat-panel" : ""
        } ${
          isDesktopRail ? "desktop-agent-panel" : ""
        } ${isMobileAgentView ? "mobile-agent-panel" : ""}`}
      >
        <div className="chat-top-row">
          <div className={`desktop-agent-heading ${isMobileAgentView ? "mobile-agent-heading" : ""}`}>
            {isMobileAgentView ? (
              <>
                <div className="mobile-agent-top-slot">
                  <button
                    type="button"
                    className="icon-button mobile-agent-menu"
                    onClick={() => setIsMobileSidebarOpen((current) => !current)}
                    aria-label={isMobileSidebarOpen ? "Close sidebar" : "Open sidebar"}
                  >
                    {isMobileSidebarOpen ? <AppIcon name="close" /> : <AppIcon name="menu" />}
                  </button>
                </div>
                <div className="mobile-agent-toggle-wrap">
                  <div className="mobile-agent-toggle" role="tablist" aria-label="Agent mode">
                    <button
                      type="button"
                    className={`mobile-agent-toggle-button ${mobileAgentTab === "agent" ? "active" : ""}`}
                    onClick={() => {
                      setMobileAgentTab("agent");
                      if (mainAgentThread?.id) {
                        setSelectedThreadId(mainAgentThread.id);
                        }
                      }}
                    >
                      Agent
                    </button>
                    <button
                      type="button"
                      className={`mobile-agent-toggle-button ${mobileAgentTab === "helper" ? "active" : ""}`}
                      onClick={() => setMobileAgentTab("helper")}
                    >
                      Helper
                    </button>
                  </div>
                </div>
                <div className="mobile-chat-thread-actions">
                  {showingSelectedMobileHelper ? (
                    <button
                      type="button"
                      className="icon-button mobile-agent-back"
                      onClick={() => setSelectedThreadId(null)}
                      aria-label="Back to helper list"
                    >
                      <AppIcon name="chevronLeft" />
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
            {!isMobileAgentView ? (
              <div className="chat-thread-meta">
                {thread?.thread_type === "general" ? (
                  <span className="sidebar-type-badge deep">Agent</span>
                ) : null}
                {thread?.thread_type !== "general" ? (
                  <div className="chat-thread-summary">
                    <strong>{helperHeaderTitle}</strong>
                    <span>{helperHeaderResume}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {isDesktopRail && thread?.thread_type !== "general" && mainAgentThread ? (
              <button
                type="button"
                className="desktop-agent-home"
                onClick={() => setSelectedThreadId(mainAgentThread.id)}
              >
                Back to Agent
              </button>
            ) : null}
          </div>
          {!isMobileAgentView ? (
            <div className="chat-thread-actions">
              <button
                className={`icon-button chat-menu-trigger ${showChatMenu ? "active" : ""}`}
                type="button"
                onClick={() => setShowChatMenu((current) => !current)}
                aria-label="Open chat options"
              >
                <AppIcon name="more" />
              </button>
              {showChatMenu ? (
                <div className="chat-menu">
                  <label className="checkbox chat-menu-checkbox">
                    <input
                      type="checkbox"
                      checked={showToolDebug}
                      onChange={(event) => setShowToolDebug(event.target.checked)}
                    />
                    Show tools
                  </label>
                  <button
                    className="chat-menu-button"
                    type="button"
                    onClick={() => {
                      setShowChatMenu(false);
                      void handleClearThread();
                    }}
                  >
                    Clear chat history
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {showDesktopHelperHeader ? renderDesktopHelperInsights() : null}
        {showMobileHelperList ? renderMobileHelperList() : null}
        {showChatBody ? (
          <div
            className={`chat-log ${isMobileAgentView ? "mobile-chat-log" : ""}`}
            ref={logRef}
            onScroll={handleChatLogScroll}
          >
            {messages.length ? (
              messages.map((message) =>
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
                  {thread?.thread_type === "general" ? "Start with Agent." : "Start with this Helper."}
                </p>
                <p className="muted">
                  {thread?.thread_type === "general"
                    ? "Ask for pipeline strategy, prioritization, follow-up planning, or a weekly search plan."
                    : "Ask about this specific role, resume fit, follow-ups, or interview prep."}
                </p>
              </div>
            )}
            {showThinkingState ? (
              <div className="chat-message assistant thinking" aria-live="polite" aria-label="Agent is thinking">
                <div className="thinking-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="chat-empty-state mobile-helper-prompt">
            <p className="chat-empty-title">Choose a helper.</p>
            <p className="muted">Pick one from the list above to open that helper chat.</p>
          </div>
        )}
        {showPendingAction ? renderPendingActionPreview() : null}
        <div className="chat-quick-actions" onWheel={forwardScrollToChat}>
          <div className="chat-quick-actions-track">
            {marqueePrompts.map((prompt, index) => (
              <button
                key={`${prompt}-${index}`}
                type="button"
                className="quick-prompt"
                onClick={() => setInputValue(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
        <form className="chat-compose chat-compose-bar" onSubmit={onSubmit}>
          <textarea
            ref={inputRef}
            rows="1"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onInput={(event) => resizeComposerTextarea(event.currentTarget)}
            onWheel={forwardScrollToChat}
            placeholder="Ask about your search strategy, a saved job, a follow-up, or an application update."
          />
          <button className="action-button primary" type="submit" disabled={sending || !threadId}>
            <span className="chat-send-icon" aria-hidden="true">
              <AppIcon name="send" />
            </span>
            <span className="sr-only">{sending ? "Sending message" : "Send message"}</span>
          </button>
        </form>
      </div>
    );
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!supabaseClient) {
      setError(authConfigError || "User authentication is not configured.");
      return;
    }

    try {
      setAuthSubmitting(true);
      setError("");
      setNotice("");
      if (authMode === "sign-in") {
        if (!isValidEmail(authForm.email)) {
          throw new Error("Enter a valid email address.");
        }
        const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: authForm.email.trim(),
          password: authForm.password,
        });
        if (signInError) {
          throw signInError;
        }
        if (data?.user && !data.user.email_confirmed_at) {
          await supabaseClient.auth.signOut();
          throw new Error("Verify your email before signing in.");
        }
      } else {
        if (!isValidEmail(authForm.email)) {
          throw new Error("Enter a valid email address.");
        }
        if (!authForm.first_name.trim() || !authForm.last_name.trim()) {
          throw new Error("First name and last name are required.");
        }
        if (!isValidUsername(authForm.username)) {
          throw new Error("Username must be 3-24 characters and use only letters, numbers, or underscores.");
        }
        if (!isStrongPassword(authForm.password)) {
          throw new Error("Password must be at least 6 characters and include a number and a symbol.");
        }
        if (authForm.password !== authForm.confirmPassword) {
          throw new Error("Password confirmation does not match.");
        }
        if (!/^\d{10}$/.test(normalizePhoneDigits(authForm.phone))) {
          throw new Error("Phone number must contain exactly 10 digits including area code.");
        }
        const usernameAvailability = await api(
          `/api/account/username-available?username=${encodeURIComponent(authForm.username.trim())}`
        );
        if (!usernameAvailability.available) {
          throw new Error(usernameAvailability.reason || "That username is already taken.");
        }
        const { error: signUpError } = await supabaseClient.auth.signUp({
          email: authForm.email.trim(),
          password: authForm.password,
          options: {
            data: {
              first_name: authForm.first_name.trim(),
              last_name: authForm.last_name.trim(),
              full_name: `${authForm.first_name.trim()} ${authForm.last_name.trim()}`.trim(),
              username: authForm.username.trim().toLowerCase(),
              phone: normalizePhoneDigits(authForm.phone),
              age: authForm.age ? Number(authForm.age) : null,
              gender: authForm.gender || "",
            },
          },
        });
        if (signUpError) {
          throw signUpError;
        }
        setNotice("Account created. Check your email and verify it before signing in.");
        setAuthMode("sign-in");
      }
      setAuthForm({ ...emptyAuthForm(), email: authForm.email.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleAdminAuthSubmit(event) {
    event.preventDefault();
    try {
      setAdminSubmitting(true);
      setError("");
      setNotice("");
      const nextAdminSession = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: adminAuthForm.username,
          password: adminAuthForm.password,
        }),
      });
      setAdminSession(nextAdminSession);
      setAdminAuthForm({ username: nextAdminSession.username || adminAuthForm.username, password: "" });
      navigateTo("/admin");
      setPage("Admin");
      setNotice("Admin session started.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAdminSubmitting(false);
    }
  }

  async function handleSignOut() {
    if (!supabaseClient) {
      return;
    }
    try {
      setError("");
      await supabaseClient.auth.signOut();
      setNotice("");
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAdminSignOut() {
    setAdminSession(null);
    setAdminAuthForm({ username: "", password: "" });
    setNotice("Admin session ended.");
  }

  const notificationType = error || authConfigError ? "error" : "success";
  const notificationMessage = error || notice || authConfigError;
  const dismissNotification = () => {
    setError("");
    setNotice("");
    setAuthConfigError("");
  };

  if (authLoading) {
    return <main className="auth-shell"><section className="auth-card"><p>Loading authentication...</p></section></main>;
  }

  if (isAdminRoute && !adminSession?.token) {
    return (
      <>
        <AdminAuthShell
          form={adminAuthForm}
          loading={adminSubmitting}
          error={error}
          onChange={setAdminAuthForm}
          onSubmit={handleAdminAuthSubmit}
          onBackToUser={() => navigateTo("/")}
        />
        <NotificationPopup type={notificationType} message={notificationMessage} onDismiss={dismissNotification} />
      </>
    );
  }

  if (!isAdminRoute && !session?.access_token && !adminSession?.token) {
    return (
      <>
        <AuthShell
          mode={authMode}
          form={authForm}
          loading={authSubmitting}
          error={error || authConfigError}
          onModeChange={setAuthMode}
          onChange={setAuthForm}
          onSubmit={handleAuthSubmit}
          onOpenAdmin={() => navigateTo("/admin")}
        />
        <NotificationPopup type={notificationType} message={notificationMessage} onDismiss={dismissNotification} />
      </>
    );
  }

  const visiblePages = showDesktopAgentRail ? DESKTOP_PAGES : MOBILE_PAGES;
  const navPages = session?.access_token
    ? [...visiblePages, ...(adminSession?.token ? ["Admin"] : [])]
    : ["Admin"];
  const currentUserFullName =
    `${String(accountForm.first_name || "").trim()} ${String(accountForm.last_name || "").trim()}`.trim() ||
    String(session?.user?.user_metadata?.full_name || "").trim();
  const currentUserLabel =
    currentUserFullName ||
    session?.user?.email ||
    (adminSession?.username ? `Admin: ${adminSession.username}` : "Signed in");
  const avatarLabel = currentUserLabel
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "JP";

  return (
    <div className="app-shell">
      <div
        className={`shell ${showDesktopAgentRail ? "with-desktop-agent-rail" : ""} ${
          showDesktopAgentRail && isDesktopAgentCollapsed ? "desktop-agent-rail-collapsed" : ""
        }`}
      >
        <aside className={`sidebar ${isMobileSidebarOpen ? "open" : ""}`}>
          <div className="sidebar-top">
            <div className="sidebar-title-row">
              <img className="sidebar-title-logo" src="/JobPilotLogo.png" alt="JobPilot logo" />
              <h1>JobPilot</h1>
            </div>
            <nav className="sidebar-nav">
              {navPages.map((item) => (
                <button
                  key={item}
                  className={`nav-button sidebar-nav-button ${item === page ? "active" : ""}`}
                  onClick={() => {
                    setPage(item);
                    navigateTo(item === "Admin" ? "/admin" : "/");
                    closeMobileSidebar();
                  }}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </nav>

            <section className="sidebar-card sidebar-panel">
          {page === "Admin" ? (
            <>
              <div className="sidebar-section-head">
                <div>
                  <p className="eyebrow">Database Control</p>
                  <h3>Admin</h3>
                </div>
                <span className="sidebar-chip">Restricted</span>
              </div>
              <div className="sidebar-note">
                Browse tables, inspect rows, and insert, update, or delete database records without writing SQL.
              </div>
              <div className="sidebar-inline-section">
                <span className="sidebar-group-label">Tables</span>
                <button
                  className="action-button primary sidebar-action"
                  type="button"
                  onClick={handleAdminCreateRow}
                  disabled={!selectedAdminTable || !adminTableData?.permissions?.can_create}
                >
                  New Row
                </button>
              </div>
              <div className="sidebar-list">
                {adminTables.length ? (
                  adminTables.map((table) => (
                    <button
                      key={table.name}
                      type="button"
                      className={`mini-button sidebar-item ${selectedAdminTable === table.name ? "active" : ""}`}
                      onClick={() => {
                        setSelectedAdminTable(table.name);
                        setAdminTableOffset(0);
                        setAdminEditorMode(null);
                      }}
                    >
                      <span className="sidebar-item-title">{table.name}</span>
                      <span className="sidebar-item-meta">
                        <span className="sidebar-type-badge status">{table.row_count} rows</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="sidebar-empty">No tables available.</p>
                )}
              </div>
            </>
          ) : null}
          {page === "Agent" ? (
            <>
              {generalThreads.length ? (
                <div className="sidebar-list">
                  {generalThreads.map((thread) => (
                    <div key={thread.id} className="sidebar-item-row sidebar-item-row-helper sidebar-item-row-no-actions">
                      <button
                        type="button"
                        className={`mini-button sidebar-item sidebar-helper-item ${selectedThreadId === thread.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedThreadId(thread.id);
                          closeMobileSidebar();
                        }}
                      >
                        <span className="sidebar-item-title">Agent</span>
                        <span className="sidebar-item-meta sidebar-helper-meta">
                          <span>Main strategist</span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sidebar-empty">Agent is created automatically for this user.</p>
              )}
              {renderHelperSidebarItems()}
            </>
          ) : page === "Helpers" ? (
            <>
              <div className="sidebar-section-head">
                <div>
                  <p className="eyebrow">Focused Threads</p>
                  <h3>Helpers</h3>
                </div>
                <span className="sidebar-chip">{jobThreads.length}</span>
              </div>
              {renderHelperSidebarItems()}
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
                    const menuId = `session-${session.id}`;
                    return (
                      <div key={session.id} className="sidebar-item-row sidebar-item-row-helper sidebar-item-row-flat">
                        <button
                          type="button"
                          className={`mini-button sidebar-item sidebar-helper-item ${selectedSessionId === session.id ? "active" : ""}`}
                          onClick={() => {
                            setSelectedSessionId(session.id);
                            closeMobileSidebar();
                          }}
                          title={sessionTitle}
                        >
                          <span className="sidebar-item-title">{sessionTitle}</span>
                          <span className="sidebar-item-meta sidebar-helper-meta">
                            <span>{sessionMeta}</span>
                          </span>
                        </button>
                        <div className="sidebar-item-actions">
                          <button
                            type="button"
                            className={`icon-button sidebar-item-menu-trigger ${openSidebarItemMenu === menuId ? "active" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenSidebarItemMenu((current) => (current === menuId ? null : menuId));
                            }}
                            aria-label={`Open options for search session ${session.id}`}
                          >
                            <AppIcon name="more" />
                          </button>
                          {openSidebarItemMenu === menuId ? (
                            <div className="sidebar-item-menu">
                              <button
                                type="button"
                                className="sidebar-item-menu-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRenameSession(session.id, sessionTitle);
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="sidebar-item-menu-button destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteSession(session.id);
                                  setOpenSidebarItemMenu(null);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="sidebar-empty">No saved searches yet.</p>
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
                    <div key={resume.id} className="sidebar-item-row sidebar-item-row-helper sidebar-item-row-flat">
                      <button
                        type="button"
                        className={`mini-button sidebar-item sidebar-helper-item ${selectedResumeId === resume.id ? "active" : ""}`}
                        onClick={() => {
                          setSelectedResumeId(resume.id);
                          closeMobileSidebar();
                        }}
                        title={resume.filename}
                      >
                        <span className="sidebar-item-title">{resume.filename}</span>
                        <span className="sidebar-item-meta sidebar-helper-meta">
                          <span>{new Date(resume.created_at).toLocaleDateString()}</span>
                        </span>
                      </button>
                      <div className="sidebar-item-actions">
                        <button
                          type="button"
                          className={`icon-button sidebar-item-menu-trigger ${openSidebarItemMenu === `resume-${resume.id}` ? "active" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenSidebarItemMenu((current) => (current === `resume-${resume.id}` ? null : `resume-${resume.id}`));
                          }}
                          aria-label={`Open options for resume ${resume.id}`}
                        >
                          <AppIcon name="more" />
                        </button>
                        {openSidebarItemMenu === `resume-${resume.id}` ? (
                          <div className="sidebar-item-menu">
                            <button
                              type="button"
                              className="sidebar-item-menu-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRenameResume(resume.id, resume.filename);
                              }}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="sidebar-item-menu-button destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteResume(resume.id);
                                setOpenSidebarItemMenu(null);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="sidebar-empty">No resumes saved yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="sidebar-list">
              {filteredSessions.length ? filteredSessions.map((session) => {
                const sessionTitle = session.job_title || "Untitled search";
                const menuId = `session-${session.id}`;
                return (
                <div key={session.id} className="sidebar-item-row sidebar-item-row-helper sidebar-item-row-flat">
                  <button
                    type="button"
                    className={`mini-button sidebar-item sidebar-helper-item ${selectedSessionId === session.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      closeMobileSidebar();
                    }}
                  >
                    <span className="sidebar-item-title">{sessionTitle}</span>
                    <span className="sidebar-item-meta sidebar-helper-meta">
                      <span className="sidebar-type-badge session">Saved search</span>
                      <span>{new Date(session.created_at).toLocaleDateString()} | {session.k} results</span>
                    </span>
                  </button>
                  <div className="sidebar-item-actions">
                    <button
                      type="button"
                      className={`icon-button sidebar-item-menu-trigger ${openSidebarItemMenu === menuId ? "active" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenSidebarItemMenu((current) => (current === menuId ? null : menuId));
                      }}
                      aria-label={`Open options for search session ${session.id}`}
                    >
                      <AppIcon name="more" />
                    </button>
                    {openSidebarItemMenu === menuId ? (
                      <div className="sidebar-item-menu">
                        <button
                          type="button"
                          className="sidebar-item-menu-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRenameSession(session.id, sessionTitle);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="sidebar-item-menu-button destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteSession(session.id);
                            setOpenSidebarItemMenu(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}) : <p className="sidebar-empty">No saved searches match the filter.</p>}
            </div>
          )}
            </section>
          </div>

          <div className="sidebar-bottom">
            <button
              className={`sidebar-account-trigger ${showAccountMenu ? "open" : ""}`}
              type="button"
              onClick={() => setShowAccountMenu((current) => !current)}
              aria-expanded={showAccountMenu}
            >
              <div className="sidebar-account-avatar" aria-hidden="true">{avatarLabel}</div>
              <div className="sidebar-account-copy">
                <strong>{currentUserLabel}</strong>
                <span className="sidebar-caption">
                  {adminSession?.token && !session?.access_token ? "Admin workspace" : "Private workspace"}
                </span>
              </div>
              <span className="sidebar-account-caret" aria-hidden="true">
                <AppIcon name={showAccountMenu ? "chevronUp" : "chevronDown"} />
              </span>
            </button>
            {showAccountMenu ? (
              <div className="sidebar-account-menu">
                {session?.access_token ? (
                  <button
                    className={`nav-button sidebar-account-button ${page === "Profile" ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      setPage("Profile");
                      navigateTo("/");
                      setShowAccountMenu(false);
                    }}
                  >
                    Profile
                  </button>
                ) : null}
                {adminSession?.token ? (
                  <button
                    className="action-button subtle sidebar-account-button"
                    type="button"
                    onClick={handleAdminSignOut}
                  >
                    Admin Out
                  </button>
                ) : null}
                {session?.access_token ? (
                  <button
                    className="action-button subtle sidebar-account-button"
                    type="button"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <main className="content">
        {!(page === "Agent" && !isDesktopViewport) ? (
          <div className="mobile-topbar">
            <button
              className="icon-button mobile-sidebar-toggle"
              type="button"
              onClick={() => setIsMobileSidebarOpen((current) => !current)}
              aria-label={isMobileSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isMobileSidebarOpen ? <AppIcon name="close" /> : <AppIcon name="menu" />}
            </button>
          </div>
        ) : null}

        {page === "Job Search" ? (
          <section className="grid two-up job-search-layout">
            <div className="panel job-session-list-panel">
              <div className="section-heading">
                <h3>Searched Jobs</h3>
                <p>{selectedSessionId ? "Jobs from your selected saved search." : "Select a saved search from the sidebar."}</p>
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
                <p>{selectedSessionJob ? `${selectedSessionJob.title || "Untitled"} @ ${selectedSessionJob.company || "Unknown company"}` : "Select a job from the left list."}</p>
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
                <h3>Profile and Account</h3>
                <p>Update your account details here, then keep the Agent context below aligned with your current search.</p>
              </div>
              <div className="meta-row">
                <span className="status-pill">User-managed account details</span>
                <span className="status-pill">Persistent agent context</span>
              </div>
            </div>

            <div className="panel span-two">
              <div className="section-heading">
                <h3>Account Settings</h3>
                <p>Keep your registration details accurate here. Required fields stay enforced in-app.</p>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Email</span>
                  <input value={session?.user?.email || ""} readOnly />
                </label>
                <label className="field">
                  <span>Email Verification</span>
                  <input value={session?.user?.email_confirmed_at ? "Verified" : "Pending verification"} readOnly />
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>First name</span>
                  <input
                    value={accountForm.first_name}
                    onChange={(event) => setAccountForm({ ...accountForm, first_name: event.target.value })}
                    placeholder="First name"
                  />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input
                    value={accountForm.last_name}
                    onChange={(event) => setAccountForm({ ...accountForm, last_name: event.target.value })}
                    placeholder="Last name"
                  />
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Username</span>
                  <input
                    value={accountForm.username}
                    onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })}
                    placeholder="Unique username"
                  />
                </label>
                <label className="field">
                  <span>Phone number</span>
                  <input
                    value={accountForm.phone}
                    onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })}
                    placeholder="5551234567"
                  />
                </label>
              </div>
              <div className="inline-fields">
                <label className="field">
                  <span>Age</span>
                  <input
                    type="number"
                    min="13"
                    max="120"
                    value={accountForm.age}
                    onChange={(event) => setAccountForm({ ...accountForm, age: event.target.value })}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Gender</span>
                  <select value={accountForm.gender} onChange={(event) => setAccountForm({ ...accountForm, gender: event.target.value })}>
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>
              <button className="action-button primary" type="button" onClick={handleSaveAccount} disabled={savingAccount}>
                {savingAccount ? "Saving..." : "Save Account"}
              </button>
            </div>

            <div className="panel">
              <div className="section-heading">
                <h3>Password Reset</h3>
                <p>Send a reset link to your verified email instead of changing passwords directly in-app.</p>
              </div>
              <label className="field">
                <span>Reset email</span>
                <input value={session?.user?.email || ""} readOnly />
              </label>
              <button className="action-button primary" type="button" onClick={handleSendPasswordReset}>
                Send Reset Link
              </button>
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

        {page === "Helpers" ? (
          <section className="grid">
            {selectedThread?.thread_type && selectedThread.thread_type !== "general" ? (
              renderAgentPanel()
            ) : (
              <div className="panel">
                <div className="section-heading">
                  <h3>Helpers</h3>
                  <p>Select a helper from the left rail to work on role-specific strategy, outreach, and interview prep.</p>
                </div>
                <div className="meta-row">
                  <span className="status-pill">{jobThreads.length} saved helpers</span>
                  <span className="status-pill">Agent stays pinned on the right</span>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {page === "Admin" ? (
          <section className="grid admin-layout">
            <div className="panel admin-table-panel">
              <div className="section-heading">
                <h3>Table Browser</h3>
                <p>
                  {adminTableData
                    ? `${adminTableData.table} | ${adminTableData.total} rows`
                    : "Select a table from the sidebar."}
                </p>
              </div>
              {adminSession?.token ? (
        <>
                  <div className="admin-toolbar">
                    <label className="field">
                      <span>Search rows</span>
                      <input
                        value={adminTableSearch}
                        onChange={(event) => setAdminTableSearch(event.target.value)}
                        placeholder="Search across row values"
                      />
                    </label>
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => {
                        setAdminTableOffset(0);
                        void loadAdminTable(selectedAdminTable, adminTableSearch, 0);
                      }}
                      disabled={!selectedAdminTable}
                    >
                      Search
                    </button>
                    <button
                      className="action-button"
                      type="button"
                      onClick={handleAdminCreateRow}
                      disabled={!selectedAdminTable || !adminTableData?.permissions?.can_create}
                    >
                      New Row
                    </button>
                    <button
                      className="action-button subtle"
                      type="button"
                      onClick={() => void loadAdminTable(selectedAdminTable, adminTableSearch, adminTableOffset)}
                      disabled={!selectedAdminTable}
                    >
                      Refresh
                    </button>
                  </div>
                  {adminTableData?.rows?.length ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            {adminTableData.columns.map((column) => (
                              <th key={column.name}>{column.name}</th>
                            ))}
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminTableData.rows.map((row, index) => (
                            <tr
                              key={`${adminTableData.table}-${index}`}
                              className={adminRowMatchesSelection(row) ? "active" : ""}
                              onClick={() => handleAdminEditRow(row)}
                            >
                              {adminTableData.columns.map((column) => (
                                <td key={`${index}-${column.name}`}>
                                  <div className="admin-cell" title={formatAdminCellValue(row[column.name])}>
                                    {formatAdminCellValue(row[column.name])}
                                  </div>
                                </td>
                              ))}
                              <td className="admin-row-actions">
                                <button
                                  className="mini-button"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAdminEditRow(row);
                                  }}
                                  disabled={!adminTableData.permissions?.can_update}
                                >
                                  Edit
                                </button>
                                <button
                                  className="mini-button destructive"
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleAdminDeleteRow(row);
                                  }}
                                  disabled={!adminTableData.permissions?.can_delete}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">No rows returned for the current table and filter.</p>
                  )}
                  {adminTableData ? (
                    <div className="admin-pagination">
                      <button
                        className="action-button subtle"
                        type="button"
                        onClick={() => setAdminTableOffset((current) => Math.max(current - adminTableData.limit, 0))}
                        disabled={adminTableOffset === 0}
                      >
                        Previous
                      </button>
                      <span className="tiny">
                        {adminTableOffset + 1} - {Math.min(adminTableOffset + adminTableData.limit, adminTableData.total)} of {adminTableData.total}
                      </span>
                      <button
                        className="action-button subtle"
                        type="button"
                        onClick={() => setAdminTableOffset((current) => current + adminTableData.limit)}
                        disabled={adminTableOffset + adminTableData.limit >= adminTableData.total}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted">Sign in as admin to manage database rows.</p>
              )}
            </div>

            <div className="panel admin-editor-panel">
              <div className="admin-editor-head">
                <div className="section-heading">
                  <h3>{adminEditorMode === "edit" ? "Edit Row" : adminEditorMode === "create" ? "New Row" : "Row Editor"}</h3>
                  <p>
                    {adminEditorMode
                      ? adminSelectionLabel()
                      : "Select a row in the table or create a new row to start editing."}
                  </p>
                </div>
                {adminEditorMode ? (
                  <div className="admin-editor-actions">
                    <button className="action-button subtle" type="button" onClick={() => setAdminEditorMode(null)}>
                      Cancel
                    </button>
                    <button
                      className="action-button primary"
                      type="button"
                      onClick={() => void handleAdminSaveRow()}
                      disabled={
                        adminSaving ||
                        (adminEditorMode === "edit" && !adminTableData.permissions?.can_update) ||
                        (adminEditorMode === "create" && !adminTableData.permissions?.can_create)
                      }
                    >
                      {adminSaving ? "Saving..." : adminEditorMode === "edit" ? "Save Changes" : "Insert Row"}
                    </button>
                  </div>
                ) : null}
              </div>
              {adminEditorMode && adminTableData ? (
                <>
                  <div className="admin-editor-grid">
                    {adminTableData.columns.map((column) => {
                      if (adminEditorMode === "create" && !column.creatable) {
                        return null;
                      }
                      const isPrimaryKey = Boolean(column.primary_key);
                      const isDisabled =
                        (adminEditorMode === "edit" && (!column.editable || isPrimaryKey)) ||
                        (adminEditorMode === "create" && !column.creatable);
                      return (
                        <label key={column.name} className={`field admin-editor-field ${isPrimaryKey ? "pk" : ""}`}>
                          <span>
                            {column.name}
                            {isPrimaryKey ? " (pk)" : ""}
                            {!isPrimaryKey && adminEditorMode === "edit" && !column.editable ? " (locked)" : ""}
                            {adminEditorMode === "create" && !column.creatable ? " (blocked)" : ""}
                          </span>
                          <textarea
                            rows="2"
                            value={adminEditorValues[column.name] ?? ""}
                            disabled={isDisabled}
                            onChange={(event) =>
                              setAdminEditorValues((current) => ({
                                ...current,
                                [column.name]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                  {adminEditorMode === "edit" ? (
                    <div className="admin-editor-footer">
                      <button
                        className="action-button destructive"
                        type="button"
                        onClick={() =>
                          void handleAdminDeleteRow(
                            Object.fromEntries(
                              adminTableData.columns.map((column) => [column.name, adminEditorValues[column.name] ?? ""])
                            )
                          )
                        }
                        disabled={adminSaving || !adminTableData.permissions?.can_delete}
                      >
                        Delete Row
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="sidebar-note-card">
                  <span className="sidebar-type-badge status">Admin</span>
                  <p className="muted">Protected fields are locked server-side. Only safe content fields can be edited, and row creation is disabled for tables that would require risky identity or relationship fields.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {page === "Agent" && !showDesktopAgentRail ? (
          <section className="grid">
            {renderAgentPanel()}
          </section>
        ) : null}
      </main>
      {showDesktopAgentRail ? (
        <aside className={`desktop-agent-rail ${isDesktopAgentCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="desktop-agent-toggle"
            onClick={() => setIsDesktopAgentCollapsed((current) => !current)}
            aria-label={isDesktopAgentCollapsed ? "Expand agent rail" : "Collapse agent rail"}
            title={isDesktopAgentCollapsed ? "Expand Agent" : "Collapse Agent"}
          >
            {isDesktopAgentCollapsed ? <AppIcon name="chevronLeft" /> : <AppIcon name="chevronRight" />}
          </button>
          {!isDesktopAgentCollapsed
            ? renderAgentPanel({
                isDesktopRail: true,
                thread: agentThread,
                threadId: mainAgentThread?.id,
                messages: agentCombinedThreadMessages,
                inputValue: agentChatInput,
                setInputValue: setAgentChatInput,
                onSubmit: handleSendAgentChat,
                sending: sendingAgentChat,
                logRef: agentChatLogRef,
                inputRef: agentChatInputRef,
              })
            : null}
        </aside>
      ) : null}

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
                <AppIcon name="close" />
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
                <AppIcon name="close" />
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
                    placeholder="e.g. Toronto, Canada"
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
              </div>
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
                <AppIcon name="close" />
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
      {isMobileSidebarOpen ? (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-label="Close sidebar"
        />
      ) : null}
      <NotificationPopup type={notificationType} message={notificationMessage} onDismiss={dismissNotification} />
      </div>
    </div>
  );
}

