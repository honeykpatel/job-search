import { Send, Sparkles } from "lucide-react";
import { Badge } from "../../shared/components/ui/Badge";
import { Button } from "../../shared/components/ui/Button";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { GROUNDING_COPY } from "../../shared/constants/product";
import { getJobCompany, getJobId, getJobTitle, normalizeStatus } from "../../shared/utils/format";

export function CoachPage({ jobs, resumes, annotations, thread, messages, message, setMessage, onCreateThread, onSendMessage, sending }) {
  const activeJobs = jobs.filter((job) => !["Rejected", "Archived"].includes(normalizeStatus(job.application_status)));
  const dueSoon = activeJobs.filter((job) => annotations[getJobId(job)]?.dueDate).slice(0, 4);
  const gaps = activeJobs.filter((job) => !annotations[getJobId(job)]?.nextStep).slice(0, 4);

  return (
    <div className="coach-page">
      <section className="hero-panel">
        <p className="eyebrow">Career Coach</p>
        <h2>Strategy view, not a permanent chat rail.</h2>
        <p>{GROUNDING_COPY.coach} Use it after your jobs, resumes, and next steps are current.</p>
      </section>

      <div className="strategy-grid">
        <Panel>
          <SectionHeader title="Priorities" description="Where attention is most useful right now." />
          <ul className="check-list">
            <li>Review saved roles before adding more searches.</li>
            <li>Tailor the resume on high-priority jobs before applying.</li>
            <li>Add due dates where follow-up timing matters.</li>
          </ul>
        </Panel>
        <Panel>
          <SectionHeader title="Pipeline health" description={GROUNDING_COPY.pipeline} />
          <div className="metric-row compact">
            <Metric label="Active jobs" value={activeJobs.length} />
            <Metric label="Resumes" value={resumes.length} />
            <Metric label="Missing next step" value={gaps.length} />
          </div>
        </Panel>
        <Panel>
          <SectionHeader title="Follow-up suggestions" description="Built from due dates and missing next steps." />
          {dueSoon.length || gaps.length ? (
            <div className="compact-list">
              {[...dueSoon, ...gaps].slice(0, 5).map((job) => (
                <div key={getJobId(job)} className="compact-list__item is-static">
                  <span>
                    <strong>{getJobTitle(job)}</strong>
                    <small>{getJobCompany(job)}</small>
                  </span>
                  <Badge tone="info">{annotations[getJobId(job)]?.nextStep || "Add next step"}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No urgent follow-ups. Keep pipeline items updated as you apply.</p>
          )}
        </Panel>
        <Panel>
          <SectionHeader title="Weekly strategy" description="A simple loop for the next working session." />
          <ol className="number-list">
            <li>Review saved jobs and archive weak fits.</li>
            <li>Pick two roles to tailor today.</li>
            <li>Move applied jobs into Pipeline and set next steps.</li>
            <li>Ask Career Coach only after the data is current.</li>
          </ol>
        </Panel>
      </div>

      <Panel className="career-coach-chat">
        <SectionHeader eyebrow="Career Coach" title="Ask for strategy" description={GROUNDING_COPY.coach} />
        {!thread ? (
          <Button type="button" onClick={onCreateThread}>
            <Sparkles size={16} /> Start Career Coach
          </Button>
        ) : (
          <>
            <div className="coach-transcript large" aria-live="polite">
              {messages.length ? (
                messages.slice(-10).map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`coach-message coach-message--${item.role}`}>
                    <span>{item.role === "user" ? "You" : "Career Coach"}</span>
                    <p>{item.content}</p>
                  </div>
                ))
              ) : (
                <p className="muted">Ask what to prioritize this week, which jobs need action, or how to sequence follow-ups.</p>
              )}
              {sending ? <p className="thinking-line">Career Coach is thinking...</p> : null}
            </div>
            <form className="coach-input" onSubmit={onSendMessage}>
              <label className="sr-only" htmlFor="career-coach-message">Message Career Coach</label>
              <textarea id="career-coach-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={1} placeholder="Ask for job-search strategy..." />
              <Button type="submit" size="icon" aria-label="Send message" disabled={sending || !message.trim()}>
                <Send size={16} />
              </Button>
            </form>
          </>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
