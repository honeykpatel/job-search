import { CalendarClock } from "lucide-react";
import { EmptyState } from "../../shared/components/feedback/EmptyState";
import { Badge } from "../../shared/components/ui/Badge";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { Field } from "../../shared/components/forms/Field";
import { listItemProps, motion, revealProps, useReducedMotion } from "../../shared/lib/motion";
import { PIPELINE_STAGES, PRIORITIES } from "../../shared/constants/product";
import { formatDate, getJobCompany, getJobId, getJobTitle, normalizeStatus } from "../../shared/utils/format";

export function PipelinePage({ jobs, resumes, annotations, onApplicationUpdate, onAnnotationUpdate, onSelectJob }) {
  const reduceMotion = useReducedMotion();
  const grouped = PIPELINE_STAGES.map((stage) => ({
    stage,
    jobs: jobs.filter((job) => normalizeStatus(job.application_status) === stage),
  }));

  return (
    <motion.div className="page-stack" {...revealProps(reduceMotion)}>
      <SectionHeader
        eyebrow="Track"
        title="Pipeline"
        description="Grouped by stage so status, next action, and due date stay visible."
      />
      <div className="pipeline-board" role="list">
        {grouped.map(({ stage, jobs: stageJobs }, columnIndex) => (
          <motion.section key={stage} className="pipeline-column" aria-label={`${stage} jobs`} role="listitem" {...listItemProps(reduceMotion, columnIndex)}>
            <div className="pipeline-column__header">
              <h3>{stage}</h3>
              <Badge tone="neutral">{stageJobs.length}</Badge>
            </div>
            {stageJobs.length ? (
              stageJobs.map((job, index) => {
                const id = getJobId(job);
                const annotation = { priority: "Medium", nextStep: "", dueDate: "", ...(annotations[id] || {}) };
                const resume = resumes.find((item) => Number(item.id) === Number(job.resume_id));
                return (
                  <motion.div key={id} {...listItemProps(reduceMotion, index)}>
                    <Panel className="pipeline-card">
                    <button type="button" className="pipeline-card__title" onClick={() => onSelectJob(job)}>
                      <span>{getJobCompany(job)}</span>
                      <strong>{getJobTitle(job)}</strong>
                    </button>
                    <dl className="definition-list">
                      <div>
                        <dt>Resume used</dt>
                        <dd>{resume?.filename || job.resume_filename || "Not selected"}</dd>
                      </div>
                      <div>
                        <dt>Next action</dt>
                        <dd>{annotation.nextStep || "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Due date</dt>
                        <dd>{formatDate(annotation.dueDate)}</dd>
                      </div>
                    </dl>
                    <details className="pipeline-edit">
                      <summary>Edit next step</summary>
                      <div className="pipeline-card__controls">
                        <Field label="Status">
                          <select value={stage} onChange={(event) => onApplicationUpdate(job, { status: event.target.value, resume_id: job.resume_id || null })}>
                            {PIPELINE_STAGES.map((option) => (
                              <option key={option}>{option}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Priority">
                          <select value={annotation.priority} onChange={(event) => onAnnotationUpdate(id, { priority: event.target.value })}>
                            {PRIORITIES.map((priority) => (
                              <option key={priority}>{priority}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Next Step">
                          <input value={annotation.nextStep} onChange={(event) => onAnnotationUpdate(id, { nextStep: event.target.value })} />
                        </Field>
                        <Field label="Due">
                          <input type="date" value={annotation.dueDate} onChange={(event) => onAnnotationUpdate(id, { dueDate: event.target.value })} />
                        </Field>
                      </div>
                    </details>
                    </Panel>
                  </motion.div>
                );
              })
            ) : (
              <EmptyState title={`No ${stage.toLowerCase()} jobs`} description="Move jobs into this stage from Jobs or another pipeline card." icon={CalendarClock} />
            )}
          </motion.section>
        ))}
      </div>
    </motion.div>
  );
}
