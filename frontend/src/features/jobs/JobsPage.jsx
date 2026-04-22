import { ArrowUpRight, Bot, RefreshCcw, Search, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../shared/components/feedback/EmptyState";
import { Button } from "../../shared/components/ui/Button";
import { Badge } from "../../shared/components/ui/Badge";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { Field } from "../../shared/components/forms/Field";
import { GROUNDING_COPY, PIPELINE_STAGES, PRIORITIES, SAVE_REASONS, WORK_STYLES } from "../../shared/constants/product";
import {
  compactText,
  fitLabelFromInsights,
  formatDate,
  getJobCompany,
  getJobId,
  getJobLocation,
  getJobTitle,
  normalizeStatus,
  relativeDate,
} from "../../shared/utils/format";

export function JobsPage({
  jobs,
  savedSearches,
  resumes,
  selectedJob,
  selectedResumeId,
  selectedSearchId,
  annotations,
  onSearch,
  searchPending,
  onSavedSearchSelect,
  onJobSelect,
  onResumeSelect,
  onApplicationUpdate,
  onAnnotationUpdate,
  jobCoach,
}) {
  const [searchForm, setSearchForm] = useState({ job_title: "", location: "", work_style: "remote", k: 10 });
  const [notesDraft, setNotesDraft] = useState("");
  const jobId = getJobId(selectedJob);
  const annotation = { priority: "Medium", nextStep: "", dueDate: "", saveReason: "", ...(annotations[jobId] || {}) };

  useEffect(() => {
    setNotesDraft(selectedJob?.application_notes || "");
  }, [selectedJob?.application_notes, jobId]);

  function submitSearch(event) {
    event.preventDefault();
    onSearch(searchForm);
  }

  return (
    <div className="jobs-layout">
      <aside className="jobs-control-panel" aria-label="Search and saved searches">
        <Panel className="search-panel">
          <SectionHeader title="Discover jobs" description="Search, save, then review one job at a time." />
          <form className="stack-form" onSubmit={submitSearch}>
            <Field label="Role or keyword">
              <input value={searchForm.job_title} onChange={(event) => setSearchForm({ ...searchForm, job_title: event.target.value })} placeholder="Product designer, AI engineer..." />
            </Field>
            <Field label="Location">
              <input value={searchForm.location} onChange={(event) => setSearchForm({ ...searchForm, location: event.target.value })} placeholder="Toronto, Remote..." />
            </Field>
            <div className="form-grid two">
              <Field label="Work style">
                <select value={searchForm.work_style} onChange={(event) => setSearchForm({ ...searchForm, work_style: event.target.value })}>
                  {WORK_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Count">
                <input type="number" min="1" max="50" value={searchForm.k} onChange={(event) => setSearchForm({ ...searchForm, k: Number(event.target.value) })} />
              </Field>
            </div>
            <Button type="submit" disabled={searchPending}>
              <Search size={16} />
              {searchPending ? "Searching..." : "Search jobs"}
            </Button>
          </form>
        </Panel>

        <Panel className="saved-search-panel">
          <SectionHeader title="Saved Searches" description="Reusable searches for roles, locations, and work styles." />
          {savedSearches.length ? (
            <div className="saved-search-list">
              {savedSearches.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={Number(selectedSearchId) === Number(session.id) ? "is-active" : ""}
                  onClick={() => onSavedSearchSelect(session.id)}
                >
                  <strong>{session.job_title || "Untitled search"}</strong>
                  <span>
                    {session.location || "Any location"} - {session.job_count || 0} jobs
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No saved searches yet" description="Search for a role to create a Saved Search." />
          )}
        </Panel>
      </aside>

      <section className="job-list-panel" aria-label="Job list">
        <div className="list-header">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>{jobs.length} jobs</h2>
          </div>
        </div>
        {jobs.length ? (
          <div className="job-list">
            {jobs.map((job) => {
              const id = getJobId(job);
              const active = id === jobId;
              const meta = { priority: "Medium", ...(annotations[id] || {}) };
              return (
                <button key={id} type="button" className={`job-row ${active ? "is-active" : ""}`} onClick={() => onJobSelect(job)}>
                  <span className="job-row__main">
                    <strong>{getJobTitle(job)}</strong>
                    <small>{getJobCompany(job)} - {getJobLocation(job)}</small>
                    <small>{job.source || "Source unknown"} - saved {relativeDate(job.created_at || job.application_updated_at)}</small>
                  </span>
                  <span className="job-row__meta">
                    <Badge tone={meta.priority === "High" ? "strong" : "neutral"}>{meta.priority}</Badge>
                    <Badge tone="info">{normalizeStatus(job.application_status)}</Badge>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No jobs to review" description="Run a search or choose a Saved Search." />
        )}
      </section>

      <section className="job-workspace" aria-label="Selected job workspace">
        {selectedJob ? (
          <>
            <JobWorkspaceHeader job={selectedJob} />
            <Panel className="job-workspace__controls">
              <Field label="Resume">
                <select value={selectedResumeId || ""} onChange={(event) => onResumeSelect(event.target.value ? Number(event.target.value) : "")}>
                  <option value="">Choose resume</option>
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.filename}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={normalizeStatus(selectedJob.application_status)}
                  onChange={(event) => onApplicationUpdate(selectedJob, { status: event.target.value, resume_id: selectedResumeId || selectedJob.resume_id || null })}
                >
                  {PIPELINE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select value={annotation.priority} onChange={(event) => onAnnotationUpdate(jobId, { priority: event.target.value })}>
                  {PRIORITIES.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <select value={annotation.saveReason} onChange={(event) => onAnnotationUpdate(jobId, { saveReason: event.target.value })}>
                  <option value="">Not set</option>
                  {SAVE_REASONS.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </select>
              </Field>
              <Field label="Next step">
                <input value={annotation.nextStep} onChange={(event) => onAnnotationUpdate(jobId, { nextStep: event.target.value })} placeholder="Follow up, tailor resume..." />
              </Field>
              <Field label="Due date">
                <input type="date" value={annotation.dueDate} onChange={(event) => onAnnotationUpdate(jobId, { dueDate: event.target.value })} />
              </Field>
            </Panel>

            <div className="job-workspace__grid">
              <div className="job-workspace__main">
                <JobInsights insights={jobCoach.insights} loading={jobCoach.insightsLoading} onRefresh={jobCoach.onRefreshInsights} resumeSelected={Boolean(selectedResumeId)} />
                <Panel>
                  <SectionHeader title="Job description" description="Original posting, formatted for reading." />
                  <p className="long-copy">{compactText(selectedJob.description, "No detailed job description was provided by the source.")}</p>
                  {selectedJob.url ? (
                    <Button asChild variant="ghost" size="sm">
                      <a href={selectedJob.url} target="_blank" rel="noreferrer">
                        Open source <ArrowUpRight size={15} />
                      </a>
                    </Button>
                  ) : null}
                </Panel>
                <Panel>
                  <SectionHeader title="Notes" description="Private notes for this opportunity. Saved when you leave the field." />
                  <textarea
                    rows={4}
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    onBlur={() => onApplicationUpdate(selectedJob, { notes: notesDraft, status: normalizeStatus(selectedJob.application_status), resume_id: selectedResumeId || selectedJob.resume_id || null })}
                    placeholder="Add interview details, recruiter names, or tailoring ideas."
                  />
                </Panel>
              </div>
              <JobCoachPanel {...jobCoach} selectedJob={selectedJob} selectedResumeId={selectedResumeId} />
            </div>
          </>
        ) : (
          <EmptyState title="Select a job to start" description="The workspace will show job details, Resume Fit, Skill Gaps, and the Job Coach." />
        )}
      </section>
    </div>
  );
}

function JobWorkspaceHeader({ job }) {
  return (
    <div className="job-workspace__header">
      <p className="eyebrow">Review &gt; Tailor &gt; Track</p>
      <h2>{getJobTitle(job)}</h2>
      <p>{getJobCompany(job)} - {getJobLocation(job)}</p>
    </div>
  );
}

function JobInsights({ insights, loading, onRefresh, resumeSelected }) {
  const fit = fitLabelFromInsights(insights);
  const requirements = insights?.important_skills || insights?.key_requirements || [];
  const gaps = insights?.skills_to_upgrade || insights?.skill_gaps || [];
  const draft = insights?.cover_letter_draft || insights?.draft_intro || "";

  return (
    <Panel className="ai-insights">
      <SectionHeader
        eyebrow="AI guidance"
        title="Resume Fit"
        description={GROUNDING_COPY.job}
        action={
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading || !resumeSelected}>
            <RefreshCcw size={15} /> Refresh
          </Button>
        }
      />
      {!resumeSelected ? <p className="inline-warning">Choose a resume to generate grounded Job Coach insights.</p> : null}
      <div className="fit-summary">
        <Badge tone={fit.tone}>{fit.label}</Badge>
        <p>{fit.explanation}</p>
      </div>
      <p className="metadata">Last generated: {insights?.generated_at ? formatDate(insights.generated_at) : loading ? "Generating..." : "Not generated yet"}</p>
      <div className="insight-grid">
        <InsightBlock title="Key Requirements" items={requirements} empty="Generate insights to list requirements." />
        <InsightBlock title="Skill Gaps" items={gaps} empty="No major gaps detected yet." />
        <InsightBlock title="Tailoring Advice" items={insights?.tailoring_advice || insights?.suggestions || []} empty="Generate insights to get tailoring advice." />
        <div className="insight-block">
          <h4>Draft Intro</h4>
          <p>{draft || "Generate insights to create a short starter note."}</p>
          {draft ? <Button type="button" variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(draft)}>Copy</Button> : null}
        </div>
      </div>
    </Panel>
  );
}

function InsightBlock({ title, items, empty }) {
  const normalized = Array.isArray(items) ? items : [];
  return (
    <div className="insight-block">
      <h4>{title}</h4>
      {normalized.length ? (
        <ul>
          {normalized.slice(0, 7).map((item) => (
            <li key={String(item)}>{String(item)}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function JobCoachPanel({ thread, messages, message, setMessage, onCreateThread, onSendMessage, sending, selectedResumeId }) {
  return (
    <Panel className="job-coach-panel" as="aside">
      <SectionHeader eyebrow="Job Coach" title="Grounded role support" description={GROUNDING_COPY.job} />
      {!selectedResumeId ? (
        <p className="inline-warning">Choose a resume before creating a Job Coach for this role.</p>
      ) : !thread ? (
        <Button type="button" variant="secondary" onClick={onCreateThread}>
          <Bot size={16} /> Start Job Coach
        </Button>
      ) : (
        <>
          <div className="coach-transcript" aria-live="polite">
            {messages.length ? (
              messages.slice(-8).map((item, index) => (
                <div key={`${item.role}-${index}`} className={`coach-message coach-message--${item.role}`}>
                  <span>{item.role === "user" ? "You" : "Job Coach"}</span>
                  <p>{item.content}</p>
                </div>
              ))
            ) : (
              <p className="muted">Ask how to tailor this resume, prepare for screening, or clarify skill gaps.</p>
            )}
            {sending ? <p className="thinking-line">Job Coach is thinking...</p> : null}
          </div>
          <form className="coach-input" onSubmit={onSendMessage}>
            <label className="sr-only" htmlFor="job-coach-message">Message Job Coach</label>
            <textarea id="job-coach-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={1} placeholder="Ask about this job..." />
            <Button type="submit" size="icon" aria-label="Send message" disabled={sending || !message.trim()}>
              <Send size={16} />
            </Button>
          </form>
        </>
      )}
    </Panel>
  );
}
