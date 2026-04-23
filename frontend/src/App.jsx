import { createClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AppLayout } from "./app/layouts/AppLayout";
import { AuthShell } from "./features/auth/AuthShell";
import { CoachPage } from "./features/coach/CoachPage";
import { HomePage } from "./features/dashboard/HomePage";
import { JobsPage } from "./features/jobs/JobsPage";
import { PipelinePage } from "./features/pipeline/PipelinePage";
import { ResumesPage } from "./features/resumes/ResumesPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PageSkeleton } from "./shared/components/feedback/Skeleton";
import { apiRequest, createWorkspaceApi } from "./shared/lib/api";
import { motion } from "./shared/lib/motion";
import { useJobAnnotations } from "./shared/hooks/useJobAnnotations";
import { useResumeMetadata } from "./shared/hooks/useResumeMetadata";
import { getJobId, normalizeStatus } from "./shared/utils/format";

const DEFAULT_PAGE = "home";

function normalizeMessages(thread) {
  const messages = thread?.messages || thread?.messages_json || [];
  return Array.isArray(messages) ? messages : [];
}

function accountDisplayName(account, session, guestSession) {
  if (guestSession) return "Guest";
  const fullName = [account?.first_name, account?.last_name].filter(Boolean).join(" ").trim();
  return fullName || account?.username || session?.user?.user_metadata?.full_name || session?.user?.email || "JobPilot user";
}

function authUserIsVerified(session) {
  return Boolean(session?.user?.email_confirmed_at || session?.user?.confirmed_at);
}

export default function App() {
  const queryClient = useQueryClient();
  const annotations = useJobAnnotations((state) => state.annotations);
  const updateAnnotation = useJobAnnotations((state) => state.updateAnnotation);
  const resumeMetadata = useResumeMetadata((state) => state.metadata);
  const updateResumeMetadata = useResumeMetadata((state) => state.updateMetadata);

  const [page, setPage] = useState(DEFAULT_PAGE);
  const [theme, setTheme] = useState(() => window.localStorage.getItem("jobpilot-theme") || "dark");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authMode, setAuthMode] = useState("sign-in");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [supabaseClient, setSupabaseClient] = useState(null);
  const [session, setSession] = useState(null);
  const [guestSession, setGuestSession] = useState(null);
  const [selectedSearchId, setSelectedSearchId] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [careerMessage, setCareerMessage] = useState("");
  const [jobCoachMessage, setJobCoachMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState({});
  const [accountDraft, setAccountDraft] = useState({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("jobpilot-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    async function initializeAuth() {
      try {
        const config = await apiRequest("/api/auth/config");
        if (!active) return;
        const client = createClient(config.supabase_url, config.supabase_anon_key);
        const sessionResult = await client.auth.getSession();
        const nextSession = sessionResult.data.session || null;
        setSupabaseClient(client);
        setSession(authUserIsVerified(nextSession) ? nextSession : null);
        if (nextSession && !authUserIsVerified(nextSession)) {
          await client.auth.signOut();
          setNotice("Verify your email before signing in.");
        }
        const { data } = client.auth.onAuthStateChange((_event, incomingSession) => {
          if (incomingSession && !authUserIsVerified(incomingSession)) {
            void client.auth.signOut();
            setSession(null);
            setNotice("Verify your email before signing in.");
            return;
          }
          setGuestSession(null);
          setSession(incomingSession || null);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      } catch (error) {
        setAuthError(error.message || "Authentication is not configured.");
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    void initializeAuth();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const workspace = useMemo(
    () => ({
      accessToken: session?.access_token || "",
      guestToken: guestSession?.token || "",
      key: session?.user?.id || guestSession?.guest_user_id || "",
    }),
    [guestSession, session]
  );
  const hasWorkspace = Boolean(workspace.key);
  const workspaceApi = useMemo(() => createWorkspaceApi(workspace), [workspace]);

  const savedSearchesQuery = useQuery({
    queryKey: ["saved-searches", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/sessions"),
  });
  const resumesQuery = useQuery({
    queryKey: ["resumes", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/resumes"),
  });
  const recentJobsQuery = useQuery({
    queryKey: ["jobs", "recent", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/jobs/recent?limit=200"),
  });
  const pipelineJobsQuery = useQuery({
    queryKey: ["jobs", "pipeline", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/jobs?limit=500"),
  });
  const threadsQuery = useQuery({
    queryKey: ["threads", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/threads"),
  });
  const profileQuery = useQuery({
    queryKey: ["profile", workspace.key],
    enabled: hasWorkspace,
    queryFn: () => workspaceApi("/api/profile"),
  });
  const accountQuery = useQuery({
    queryKey: ["account", workspace.key],
    enabled: hasWorkspace && !guestSession,
    queryFn: () => workspaceApi("/api/account"),
  });
  const searchJobsQuery = useQuery({
    queryKey: ["saved-search-jobs", workspace.key, selectedSearchId],
    enabled: hasWorkspace && Boolean(selectedSearchId),
    queryFn: () => workspaceApi(`/api/sessions/${selectedSearchId}/jobs`),
  });

  useEffect(() => {
    if (accountQuery.data) setAccountDraft(accountQuery.data);
  }, [accountQuery.data]);

  useEffect(() => {
    if (profileQuery.data) setProfileDraft(profileQuery.data);
  }, [profileQuery.data]);

  const savedSearches = savedSearchesQuery.data || [];
  const resumes = resumesQuery.data || [];
  const recentJobs = recentJobsQuery.data || [];
  const pipelineJobs = pipelineJobsQuery.data || [];
  const searchJobs = searchJobsQuery.data || [];
  const threads = threadsQuery.data || [];

  const jobs = useMemo(() => {
    const seen = new Map();
    [...searchJobs, ...recentJobs, ...pipelineJobs].forEach((job) => {
      const id = getJobId(job);
      if (id && !seen.has(id)) seen.set(id, job);
    });
    return Array.from(seen.values());
  }, [pipelineJobs, recentJobs, searchJobs]);

  const selectedJob = useMemo(() => {
    if (!selectedJobId && jobs.length) return jobs[0];
    return jobs.find((job) => getJobId(job) === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedResumeId && resumes[0]?.id) setSelectedResumeId(resumes[0].id);
  }, [resumes, selectedResumeId]);

  const careerThread = threads.find((thread) => thread.thread_type === "general") || null;
  const jobCoachThread =
    selectedJob && selectedResumeId
      ? threads.find(
          (thread) =>
            thread.thread_type === "job" &&
            String(thread.job_id) === String(getJobId(selectedJob)) &&
            Number(thread.resume_id) === Number(selectedResumeId)
        ) || null
      : null;

  const careerThreadQuery = useQuery({
    queryKey: ["thread", workspace.key, careerThread?.id],
    enabled: hasWorkspace && Boolean(careerThread?.id),
    queryFn: () => workspaceApi(`/api/threads/${careerThread.id}`),
  });
  const jobThreadQuery = useQuery({
    queryKey: ["thread", workspace.key, jobCoachThread?.id],
    enabled: hasWorkspace && Boolean(jobCoachThread?.id),
    queryFn: () => workspaceApi(`/api/threads/${jobCoachThread.id}`),
  });

  const searchMutation = useMutation({
    mutationFn: (payload) =>
      workspaceApi("/api/search", {
        method: "POST",
        body: JSON.stringify({ ...payload, save_results: true }),
      }),
    onSuccess: (payload) => {
      setSelectedSearchId(payload.session_id);
      queryClient.invalidateQueries({ queryKey: ["saved-searches", workspace.key] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "recent", workspace.key] });
      queryClient.invalidateQueries({ queryKey: ["jobs", "pipeline", workspace.key] });
      setPage("jobs");
    },
  });

  const applicationMutation = useMutation({
    mutationFn: ({ job, patch }) =>
      workspaceApi(`/api/applications/${encodeURIComponent(getJobId(job))}`, {
        method: "PUT",
        body: JSON.stringify({
          status: patch.status || normalizeStatus(job.application_status),
          resume_id: patch.resume_id ?? job.resume_id ?? null,
          notes: patch.notes ?? job.application_notes ?? "",
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const uploadResumeMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return workspaceApi("/api/resumes", { method: "POST", body: formData, headers: {} });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes", workspace.key] }),
  });

  const deleteResumeMutation = useMutation({
    mutationFn: (resumeId) => workspaceApi(`/api/resumes/${resumeId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resumes", workspace.key] });
      queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] });
    },
  });

  const createCareerThreadMutation = useMutation({
    mutationFn: () => workspaceApi("/api/threads/general", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] }),
  });

  const createJobThreadMutation = useMutation({
    mutationFn: () =>
      workspaceApi("/api/threads/job", {
        method: "POST",
        body: JSON.stringify({ job_id: getJobId(selectedJob), resume_id: Number(selectedResumeId) }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] }),
  });

  const careerSendMutation = useMutation({
    mutationFn: (content) =>
      workspaceApi(`/api/threads/${careerThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setCareerMessage("");
      queryClient.invalidateQueries({ queryKey: ["thread", workspace.key, careerThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] });
    },
  });

  const jobSendMutation = useMutation({
    mutationFn: (content) =>
      workspaceApi(`/api/threads/${jobCoachThread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setJobCoachMessage("");
      queryClient.invalidateQueries({ queryKey: ["thread", workspace.key, jobCoachThread?.id] });
      queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] });
    },
  });

  const insightsMutation = useMutation({
    mutationFn: () => workspaceApi(`/api/threads/${jobCoachThread.id}/helper-insights`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] });
      queryClient.invalidateQueries({ queryKey: ["thread", workspace.key, jobCoachThread?.id] });
    },
  });

  const profileMutation = useMutation({
    mutationFn: () => workspaceApi("/api/profile", { method: "PUT", body: JSON.stringify(profileDraft) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile", workspace.key] }),
  });

  const accountMutation = useMutation({
    mutationFn: () => workspaceApi("/api/account", { method: "PUT", body: JSON.stringify(accountDraft) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account", workspace.key] }),
  });

  const handleAuthSubmit = useCallback(
    async (values) => {
      if (!supabaseClient) {
        setAuthError("Authentication is not configured.");
        return;
      }
      setAuthSubmitting(true);
      setAuthError("");
      setNotice("");
      try {
        if (authMode === "sign-in") {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: values.email.trim(),
            password: values.password,
          });
          if (error) throw error;
          if (data?.user && !authUserIsVerified(data.session)) {
            await supabaseClient.auth.signOut();
            throw new Error("Verify your email before signing in.");
          }
          setSession(data.session);
          setGuestSession(null);
        } else {
          const { data: usernameCheck } = await apiRequest(
            `/api/account/username-available?username=${encodeURIComponent(values.username.trim())}`
          ).then((data) => ({ data }));
          if (!usernameCheck.available) throw new Error(usernameCheck.reason || "That username is already taken.");
          const phone = values.phone.replace(/\D/g, "");
          const { error } = await supabaseClient.auth.signUp({
            email: values.email.trim(),
            password: values.password,
            options: {
              data: {
                first_name: values.first_name.trim(),
                last_name: values.last_name.trim(),
                full_name: `${values.first_name.trim()} ${values.last_name.trim()}`.trim(),
                username: values.username.trim().toLowerCase(),
                phone,
                age: values.age ? Number(values.age) : null,
                gender: values.gender || "",
              },
            },
          });
          if (error) throw error;
          setNotice("Account created. Check your email and verify it before signing in.");
          setAuthMode("sign-in");
        }
      } catch (error) {
        setAuthError(error.message);
      } finally {
        setAuthSubmitting(false);
      }
    },
    [authMode, supabaseClient]
  );

  async function handleGuestAccess() {
    setAuthSubmitting(true);
    setAuthError("");
    try {
      const guest = await apiRequest("/api/guest/session", { method: "POST" });
      setSession(null);
      setGuestSession(guest);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    setGuestSession(null);
    setSession(null);
    if (supabaseClient) await supabaseClient.auth.signOut();
    queryClient.clear();
  }

  function selectJob(job) {
    setSelectedJobId(getJobId(job));
    setPage("jobs");
  }

  const renderPage = () => {
    if (savedSearchesQuery.isLoading || resumesQuery.isLoading || recentJobsQuery.isLoading) {
      return <PageSkeleton variant={page === "jobs" ? "jobs" : "default"} />;
    }

    if (page === "jobs") {
      return (
        <JobsPage
          jobs={selectedSearchId ? searchJobs : jobs}
          savedSearches={savedSearches}
          resumes={resumes}
          selectedJob={selectedJob}
          selectedSearchId={selectedSearchId}
          selectedResumeId={selectedResumeId}
          annotations={annotations}
          onSearch={(payload) => searchMutation.mutate(payload)}
          searchPending={searchMutation.isPending}
          onSavedSearchSelect={(id) => setSelectedSearchId(id)}
          onJobSelect={(job) => setSelectedJobId(getJobId(job))}
          onResumeSelect={setSelectedResumeId}
          onApplicationUpdate={(job, patch) => applicationMutation.mutate({ job, patch })}
          onAnnotationUpdate={updateAnnotation}
          jobCoach={{
            thread: jobCoachThread,
            messages: normalizeMessages(jobThreadQuery.data),
            message: jobCoachMessage,
            setMessage: setJobCoachMessage,
            onCreateThread: () => createJobThreadMutation.mutate(),
            onSendMessage: (event) => {
              event.preventDefault();
              if (jobCoachMessage.trim() && jobCoachThread) jobSendMutation.mutate(jobCoachMessage.trim());
            },
            sending: jobSendMutation.isPending,
            insights: jobCoachThread?.helper_insights || jobThreadQuery.data?.helper_insights,
            insightsLoading: insightsMutation.isPending,
            onRefreshInsights: () => {
              if (!jobCoachThread) {
                createJobThreadMutation.mutate(undefined, {
                  onSuccess: () => setTimeout(() => queryClient.invalidateQueries({ queryKey: ["threads", workspace.key] }), 100),
                });
                return;
              }
              insightsMutation.mutate();
            },
          }}
        />
      );
    }

    if (page === "pipeline") {
      return (
        <PipelinePage
          jobs={jobs}
          resumes={resumes}
          annotations={annotations}
          onApplicationUpdate={(job, patch) => applicationMutation.mutate({ job, patch })}
          onAnnotationUpdate={updateAnnotation}
          onSelectJob={selectJob}
        />
      );
    }

    if (page === "resumes") {
      return (
        <ResumesPage
          resumes={resumes}
          jobs={jobs}
          uploadResume={(file) => uploadResumeMutation.mutate(file)}
          deleteResume={(resumeId) => deleteResumeMutation.mutate(resumeId)}
          uploadPending={uploadResumeMutation.isPending}
          metadata={resumeMetadata}
          updateMetadata={updateResumeMetadata}
        />
      );
    }

    if (page === "coach") {
      return (
        <CoachPage
          jobs={jobs}
          resumes={resumes}
          annotations={annotations}
          thread={careerThread}
          messages={normalizeMessages(careerThreadQuery.data)}
          message={careerMessage}
          setMessage={setCareerMessage}
          onCreateThread={() => createCareerThreadMutation.mutate()}
          onSendMessage={(event) => {
            event.preventDefault();
            if (careerMessage.trim() && careerThread) careerSendMutation.mutate(careerMessage.trim());
          }}
          sending={careerSendMutation.isPending}
        />
      );
    }

    if (page === "settings") {
      return (
        <SettingsPage
          profile={profileQuery.data || {}}
          account={accountQuery.data || {}}
          profileDraft={profileDraft}
          setProfileDraft={setProfileDraft}
          accountDraft={accountDraft}
          setAccountDraft={setAccountDraft}
          onProfileSave={() => profileMutation.mutate()}
          onAccountSave={() => accountMutation.mutate()}
          saving={profileMutation.isPending || accountMutation.isPending}
        />
      );
    }

    return (
      <HomePage
        jobs={jobs}
        resumes={resumes}
        annotations={annotations}
        onNavigate={setPage}
        onSelectJob={selectJob}
      />
    );
  };

  if (!hasWorkspace) {
    return (
      <AuthShell
        mode={authMode}
        setMode={setAuthMode}
        onSubmit={handleAuthSubmit}
        onGuest={handleGuestAccess}
        submitting={authSubmitting}
        loading={authLoading}
        error={authError}
        notice={notice}
        authAvailable={Boolean(supabaseClient) && !authError}
        theme={theme}
      />
    );
  }

  const account = accountQuery.data || {};
  const userLabel = accountDisplayName(account, session, guestSession);

  return (
    <AppLayout
      activePage={page}
      onPageChange={setPage}
      userLabel={userLabel}
      isGuest={Boolean(guestSession)}
      onSignOut={handleSignOut}
      theme={theme}
      onThemeToggle={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {renderPage()}
        </motion.div>
      </AnimatePresence>
    </AppLayout>
  );
}
