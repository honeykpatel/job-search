import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bot, RefreshCcw, Search, Send, Sparkles, X } from "lucide-react";
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
import { listItemProps, motion, revealProps, scaleInProps, useReducedMotion } from "../../shared/lib/motion";

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
  const reduceMotion = useReducedMotion();
  const [searchForm, setSearchForm] = useState({ job_title: "", location: "", work_style: "remote", k: 10 });
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState("overview");
  const jobId = getJobId(selectedJob);
  const annotation = { priority: "Medium", nextStep: "", dueDate: "", saveReason: "", ...(annotations[jobId] || {}) };
  const selectedResume = resumes.find((resume) => Number(resume.id) === Number(selectedResumeId)) || null;

  useEffect(() => {
    setNotesDraft(selectedJob?.application_notes || "");
  }, [selectedJob?.application_notes, jobId]);

  function submitSearch(event) {
    event.preventDefault();
    onSearch(searchForm);
    setDiscoverOpen(false);
  }

  return (
    <motion.div className="jobs-layout" {...revealProps(reduceMotion)}>
      <motion.section className="job-list-panel" aria-label="Job list" {...revealProps(reduceMotion, 0.02)}>
        <div className="jobs-page-heading">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>{jobs.length} jobs</h2>
            <p>Choose one role, then review fit, actions, notes, and coaching in the workspace.</p>
          </div>
          <Dialog.Root open={discoverOpen} onOpenChange={setDiscoverOpen}>
            <Dialog.Trigger asChild>
              <Button type="button">
                <Search size={16} />
                Discover new jobs
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content asChild aria-describedby="discover-description">
                <motion.div className="dialog-content" {...scaleInProps(reduceMotion)}>
                <div className="dialog-header">
                  <div>
                    <p className="eyebrow">Discover</p>
                    <Dialog.Title>Find jobs to review</Dialog.Title>
                    <Dialog.Description id="discover-description">
                      Add only the filters that matter. Results will be saved as a Saved Search.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="icon-button" type="button" aria-label="Close discover jobs dialog">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>
                <form className="stack-form" onSubmit={submitSearch}>
                  <Field label="Role or keyword">
                    <input
                      value={searchForm.job_title}
                      onChange={(event) => setSearchForm({ ...searchForm, job_title: event.target.value })}
                      placeholder="Product designer, AI engineer..."
                    />
                  </Field>
                  <Field label="Location">
                    <input
                      value={searchForm.location}
                      onChange={(event) => setSearchForm({ ...searchForm, location: event.target.value })}
                      placeholder="Toronto, Remote..."
                    />
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
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={searchForm.k}
                        onChange={(event) => setSearchForm({ ...searchForm, k: Number(event.target.value) })}
                      />
                    </Field>
                  </div>
                  <div className="dialog-actions">
                    <Dialog.Close asChild>
                      <Button type="button" variant="ghost">Cancel</Button>
                    </Dialog.Close>
                    <Button type="submit" disabled={searchPending}>
                      <Sparkles size={16} />
                      {searchPending ? "Searching..." : "Search and save"}
                    </Button>
                  </div>
                </form>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        <div className="saved-search-strip" aria-label="Saved Searches">
          <div className="saved-search-strip__header">
            <strong>Saved Searches</strong>
            <span>{savedSearches.length} total</span>
          </div>
          {savedSearches.length ? (
            <div className="saved-search-list">
              {savedSearches.map((session, index) => (
                <motion.button
                  key={session.id}
                  type="button"
                  className={Number(selectedSearchId) === Number(session.id) ? "is-active" : ""}
                  onClick={() => onSavedSearchSelect(session.id)}
                  {...listItemProps(reduceMotion, index)}
                >
                  <strong>{session.job_title || "Untitled search"}</strong>
                  <span>
                    {session.location || "Any location"} - {session.job_count || 0} jobs
                  </span>
                </motion.button>
              ))}
            </div>
          ) : (
            <EmptyState title="No saved searches yet" description="Search for a role to create a Saved Search." />
          )}
        </div>

        {jobs.length ? (
          <div className="job-list">
            {jobs.map((job, index) => {
              const id = getJobId(job);
              const active = id === jobId;
              const meta = { priority: "Medium", ...(annotations[id] || {}) };
              return (
                <motion.button key={id} type="button" className={`job-row ${active ? "is-active" : ""}`} onClick={() => onJobSelect(job)} layout {...listItemProps(reduceMotion, index)}>
                  <span className="job-row__main">
                    <strong>{getJobTitle(job)}</strong>
                    <small>{getJobCompany(job)} - {getJobLocation(job)}</small>
                    <small>{job.source || "Source unknown"} - saved {relativeDate(job.created_at || job.application_updated_at)}</small>
                  </span>
                  <span className="job-row__meta">
                    <Badge tone={meta.priority === "High" ? "strong" : "neutral"}>{meta.priority}</Badge>
                    <Badge tone="info">{normalizeStatus(job.application_status)}</Badge>
                  </span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No jobs to review" description="Run a search or choose a Saved Search." />
        )}
      </motion.section>

      <motion.section className="job-workspace" aria-label="Selected job workspace" {...revealProps(reduceMotion, 0.06)}>
        {selectedJob ? (
          <>
            <JobWorkspaceHeader job={selectedJob} />
            <div className="job-workspace-tabs" role="tablist" aria-label="Job workspace sections">
              {[
                ["overview", "Overview"],
                ["description", "Description"],
                ["notes", "Notes"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === id}
                  className={workspaceTab === id ? "is-active" : ""}
                  onClick={() => setWorkspaceTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
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

            <div className="job-priority-grid">
              <motion.div {...revealProps(reduceMotion, 0.08)}>
                <JobInsights
                  insights={jobCoach.insights}
                  loading={jobCoach.insightsLoading}
                  onRefresh={jobCoach.onRefreshInsights}
                  resumeSelected={Boolean(selectedResumeId)}
                  selectedJob={selectedJob}
                  selectedResume={selectedResume}
                  reduceMotion={reduceMotion}
                />
              </motion.div>
              <motion.div {...revealProps(reduceMotion, 0.12)}>
                <JobCoachPanel {...jobCoach} selectedJob={selectedJob} selectedResumeId={selectedResumeId} />
              </motion.div>
            </div>

            <motion.div className="job-workspace__main" key={`${jobId}-${workspaceTab}`} {...scaleInProps(reduceMotion)}>
              {workspaceTab === "overview" ? (
                <JobOverview job={selectedJob} annotation={annotation} setWorkspaceTab={setWorkspaceTab} />
              ) : null}
              {workspaceTab === "description" ? (
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
              ) : null}
              {workspaceTab === "notes" ? (
                <Panel>
                  <SectionHeader title="Notes" description="Private notes for this opportunity. Saved when you leave the field." />
                  <textarea
                    rows={8}
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    onBlur={() => onApplicationUpdate(selectedJob, { notes: notesDraft, status: normalizeStatus(selectedJob.application_status), resume_id: selectedResumeId || selectedJob.resume_id || null })}
                    placeholder="Add interview details, recruiter names, or tailoring ideas."
                  />
                </Panel>
              ) : null}
            </motion.div>
          </>
        ) : (
          <EmptyState title="Select a job to start" description="The workspace will show job details, Resume Fit, Skill Gaps, and the Job Coach." />
        )}
      </motion.section>
    </motion.div>
  );
}

function JobOverview({ job, annotation, setWorkspaceTab }) {
  return (
    <Panel className="job-overview-panel">
      <SectionHeader title="What needs attention" description="A short action brief before reading details or asking the Job Coach." />
      <div className="job-brief-grid">
        <div>
          <span>Status</span>
          <strong>{normalizeStatus(job.application_status)}</strong>
        </div>
        <div>
          <span>Priority</span>
          <strong>{annotation.priority}</strong>
        </div>
        <div>
          <span>Reason saved</span>
          <strong>{annotation.saveReason || "Not set"}</strong>
        </div>
      </div>
      <div className="next-action-callout">
        <p className="eyebrow">Next step</p>
        <h3>{annotation.nextStep || "Decide whether this role is worth tailoring for."}</h3>
        <p>Use Resume Fit first if you are unsure, then move to Notes or Pipeline controls.</p>
      </div>
      <div className="quick-actions">
        <Button type="button" onClick={() => setWorkspaceTab("fit")}>Review fit</Button>
        <Button type="button" variant="secondary" onClick={() => setWorkspaceTab("description")}>Read description</Button>
        <Button type="button" variant="ghost" onClick={() => setWorkspaceTab("notes")}>Open notes</Button>
      </div>
    </Panel>
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

function JobInsights({ insights, loading, onRefresh, resumeSelected, selectedJob, selectedResume, reduceMotion }) {
  const fit = fitLabelFromInsights(insights);
  const requirements = insights?.important_skills || insights?.key_requirements || [];
  const gaps = insights?.skills_to_upgrade || insights?.skill_gaps || [];
  const draft = insights?.cover_letter_draft || insights?.draft_intro || "";

  return (
    <Panel className="ai-insights">
      <div className="ai-insights__header">
        <div>
          <p className="eyebrow">AI guidance</p>
          <h3>Resume Fit</h3>
          <p>{GROUNDING_COPY.job}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={loading || !resumeSelected}>
          <RefreshCcw size={15} /> Refresh
        </Button>
      </div>
      {!resumeSelected ? <p className="inline-warning">Choose a resume to generate grounded Job Coach insights.</p> : null}
      <GroundingGraph job={selectedJob} resume={selectedResume} reduceMotion={reduceMotion} />
      <div className="fit-summary">
        <div className="fit-summary__score">
          <span>Fit</span>
          <strong>{fit.label}</strong>
        </div>
        <div>
          <Badge tone={fit.tone}>{fit.label}</Badge>
          <p>{fit.explanation}</p>
          <p className="metadata">Last generated: {insights?.generated_at ? formatDate(insights.generated_at) : loading ? "Generating..." : "Not generated yet"}</p>
        </div>
      </div>
      <div className="insight-grid">
        <InsightBlock title="Key Requirements" items={requirements} empty="Generate insights to list requirements." />
        <InsightBlock title="Skill Gaps" items={gaps} empty="No major gaps detected yet." />
        <InsightBlock title="Tailoring Advice" items={insights?.tailoring_advice || insights?.suggestions || []} empty="Generate insights to get tailoring advice." />
        <div className="insight-block insight-block--draft">
          <h4>Draft Intro</h4>
          <p>{draft || "Generate insights to create a short starter note."}</p>
          {draft ? <Button type="button" variant="secondary" size="sm" onClick={() => navigator.clipboard?.writeText(draft)}>Copy</Button> : null}
        </div>
      </div>
    </Panel>
  );
}

function GroundingGraph({ job, resume, reduceMotion }) {
  const lineAnimation = reduceMotion
    ? {}
    : {
        initial: { pathLength: 0, opacity: 0.45 },
        animate: { pathLength: 1, opacity: 1 },
        transition: { duration: 0.7, ease: "easeOut" },
      };

  return (
    <div className="grounding-graph" aria-label="AI guidance grounding map">
      <svg className="grounding-graph__lines" viewBox="0 0 520 180" preserveAspectRatio="none" aria-hidden="true">
        <motion.path d="M110 56 C180 56, 192 90, 260 90" {...lineAnimation} />
        <motion.path d="M110 124 C180 124, 192 90, 260 90" {...lineAnimation} transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.1, ease: "easeOut" }} />
      </svg>
      <motion.div className="grounding-node grounding-node--source" {...(reduceMotion ? {} : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.3 } })}>
        <span>Job</span>
        <strong>{getJobTitle(job)}</strong>
        <small>{getJobCompany(job)}</small>
      </motion.div>
      <motion.div className="grounding-node grounding-node--source" {...(reduceMotion ? {} : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.3, delay: 0.06 } })}>
        <span>Resume</span>
        <strong>{resume?.filename || "Select a resume"}</strong>
        <small>{resume ? "Selected input" : "Required for fit analysis"}</small>
      </motion.div>
      <motion.div
        className="grounding-node grounding-node--hub"
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, scale: 0.98 },
              animate: { opacity: 1, scale: 1 },
              transition: { duration: 0.34, delay: 0.12 },
            })}
      >
        <motion.span
          className="grounding-node__pulse"
          {...(reduceMotion
            ? {}
            : {
                animate: { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] },
                transition: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
              })}
        />
        <span>Linked context</span>
        <strong>AI Guidance</strong>
        <small>Based on this job and selected resume</small>
      </motion.div>
    </div>
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
