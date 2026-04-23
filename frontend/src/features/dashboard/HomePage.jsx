import { ArrowRight, CalendarClock, CheckCircle2, FileSearch, ListTodo } from "lucide-react";
import { EmptyState } from "../../shared/components/feedback/EmptyState";
import { Button } from "../../shared/components/ui/Button";
import { Badge } from "../../shared/components/ui/Badge";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { listItemProps, motion, revealProps, useReducedMotion } from "../../shared/lib/motion";
import { formatDate, getJobCompany, getJobId, getJobTitle, normalizeStatus } from "../../shared/utils/format";

export function HomePage({ jobs, resumes, annotations, onNavigate, onSelectJob }) {
  const reduceMotion = useReducedMotion();
  const needsReview = jobs.filter((job) => normalizeStatus(job.application_status) === "Saved").slice(0, 4);
  const due = jobs
    .filter((job) => {
      const dueDate = annotations[getJobId(job)]?.dueDate;
      return dueDate && new Date(dueDate) <= new Date();
    })
    .slice(0, 4);
  const highPriority = jobs.filter((job) => annotations[getJobId(job)]?.priority === "High").slice(0, 4);

  return (
    <motion.div className="page-stack" {...revealProps(reduceMotion)}>
      <motion.section className="hero-panel" {...revealProps(reduceMotion, 0.02)}>
        <p className="eyebrow">JobPilot Home</p>
        <h2>Keep the job search moving with fewer decisions on screen.</h2>
        <p>
          Start with the next useful action: review new jobs, follow up on due items, tailor a resume, or ask the Career
          Coach for strategy.
        </p>
        <div className="quick-actions">
          <Button type="button" onClick={() => onNavigate("jobs")}>
            Review jobs <ArrowRight size={16} />
          </Button>
          <Button type="button" variant="secondary" onClick={() => onNavigate("pipeline")}>
            Update pipeline
          </Button>
          <Button type="button" variant="ghost" onClick={() => onNavigate("coach")}>
            Open Career Coach
          </Button>
        </div>
      </motion.section>

      <div className="metric-row">
        <Metric icon={FileSearch} label="Jobs needing review" value={needsReview.length} index={0} reduceMotion={reduceMotion} />
        <Metric icon={CalendarClock} label="Follow-ups due" value={due.length} index={1} reduceMotion={reduceMotion} />
        <Metric icon={CheckCircle2} label="Active resumes" value={resumes.length} index={2} reduceMotion={reduceMotion} />
      </div>

      <div className="home-grid">
        <motion.div {...revealProps(reduceMotion, 0.08)}>
          <Panel>
          <SectionHeader title="Jobs needing review" description="Saved roles that still need a decision." />
          {needsReview.length ? (
            <div className="compact-list">
              {needsReview.map((job, index) => (
                <motion.button key={getJobId(job)} type="button" className="compact-list__item" onClick={() => onSelectJob(job)} {...listItemProps(reduceMotion, index)}>
                  <span>
                    <strong>{getJobTitle(job)}</strong>
                    <small>{getJobCompany(job)}</small>
                  </span>
                  <ArrowRight size={16} />
                </motion.button>
              ))}
            </div>
          ) : (
            <EmptyState title="No saved jobs waiting" description="Run a search or save jobs to build your review queue." />
          )}
          </Panel>
        </motion.div>

        <motion.div {...revealProps(reduceMotion, 0.12)}>
          <Panel>
          <SectionHeader title="Follow-ups due" description="Next steps you marked with a due date." />
          {due.length ? (
            <div className="compact-list">
              {due.map((job, index) => (
                <motion.button key={getJobId(job)} type="button" className="compact-list__item" onClick={() => onSelectJob(job)} {...listItemProps(reduceMotion, index)}>
                  <span>
                    <strong>{annotations[getJobId(job)]?.nextStep || "Follow up"}</strong>
                    <small>
                      {getJobCompany(job)} - {formatDate(annotations[getJobId(job)]?.dueDate)}
                    </small>
                  </span>
                  <Badge tone="warning">Due</Badge>
                </motion.button>
              ))}
            </div>
          ) : (
            <EmptyState title="No follow-ups due" description="Add next steps on jobs or pipeline cards to make this useful." />
          )}
          </Panel>
        </motion.div>
      </div>

      <motion.div {...revealProps(reduceMotion, 0.16)}>
        <Panel>
        <SectionHeader title="Strongest priorities" description="High-priority jobs you marked locally in this workspace." />
        {highPriority.length ? (
          <div className="job-strip">
            {highPriority.map((job, index) => (
              <motion.button key={getJobId(job)} type="button" className="job-chip" onClick={() => onSelectJob(job)} {...listItemProps(reduceMotion, index)}>
                <strong>{getJobTitle(job)}</strong>
                <span>{getJobCompany(job)}</span>
                <Badge tone="strong">High priority</Badge>
              </motion.button>
            ))}
          </div>
        ) : (
          <EmptyState title="No high-priority jobs yet" description="Mark roles as High priority from Jobs or Pipeline." icon={ListTodo} />
        )}
        </Panel>
      </motion.div>
    </motion.div>
  );
}

function Metric({ icon: Icon, label, value, index, reduceMotion }) {
  return (
    <motion.div className="metric-card" {...listItemProps(reduceMotion, index)}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}
