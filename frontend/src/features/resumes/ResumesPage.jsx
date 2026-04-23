import { FileUp, Trash2 } from "lucide-react";
import { EmptyState } from "../../shared/components/feedback/EmptyState";
import { Button } from "../../shared/components/ui/Button";
import { Badge } from "../../shared/components/ui/Badge";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { Field } from "../../shared/components/forms/Field";
import { listItemProps, motion, revealProps, useReducedMotion } from "../../shared/lib/motion";
import { formatDate } from "../../shared/utils/format";

export function ResumesPage({ resumes, jobs, uploadResume, deleteResume, uploadPending, metadata, updateMetadata }) {
  const reduceMotion = useReducedMotion();
  function jobsUsingResume(resumeId) {
    return jobs.filter((job) => Number(job.resume_id) === Number(resumeId)).length;
  }

  function onSubmit(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.resumeFile.files?.[0];
    if (file) {
      uploadResume(file);
      event.currentTarget.reset();
    }
  }

  return (
    <motion.div className="page-stack" {...revealProps(reduceMotion)}>
      <SectionHeader
        eyebrow="Tailor"
        title="Resumes"
        description="Keep a focused resume library and choose the right resume before asking for AI guidance."
      />
      <motion.div {...revealProps(reduceMotion, 0.04)}>
        <Panel className="upload-panel">
        <form className="upload-form" onSubmit={onSubmit}>
          <Field label="Upload resume" hint="PDF, DOCX, or text files work best when they contain selectable text.">
            <input name="resumeFile" type="file" accept=".pdf,.doc,.docx,.txt" />
          </Field>
          <Button type="submit" disabled={uploadPending}>
            <FileUp size={16} /> {uploadPending ? "Uploading..." : "Upload resume"}
          </Button>
        </form>
        </Panel>
      </motion.div>

      {resumes.length ? (
        <div className="resume-grid">
          {resumes.map((resume, index) => (
            <motion.div key={resume.id} {...listItemProps(reduceMotion, index)}>
              <Panel className="resume-card">
              <div>
                <p className="eyebrow">Resume</p>
                <h3>{resume.filename}</h3>
                <p>Best used for: {metadata[resume.id]?.targetRole || "Add target role"}</p>
              </div>
              <Field label="Target role">
                <input
                  value={metadata[resume.id]?.targetRole || ""}
                  onChange={(event) => updateMetadata(resume.id, { targetRole: event.target.value })}
                  placeholder="Frontend engineer, product manager..."
                />
              </Field>
              <dl className="definition-list">
                <div>
                  <dt>Last updated</dt>
                  <dd>{formatDate(resume.created_at)}</dd>
                </div>
                <div>
                  <dt>Jobs using this resume</dt>
                  <dd>{jobsUsingResume(resume.id)}</dd>
                </div>
              </dl>
              <div className="resume-card__footer">
                <Badge tone="info">{jobsUsingResume(resume.id)} jobs</Badge>
                <Badge tone={metadata[resume.id]?.targetRole ? "strong" : "warning"}>
                  {metadata[resume.id]?.targetRole ? "Ready to match" : "Needs target"}
                </Badge>
                <Button type="button" variant="ghost" size="sm" onClick={() => deleteResume(resume.id)} aria-label={`Delete ${resume.filename}`}>
                  <Trash2 size={15} /> Delete
                </Button>
              </div>
              </Panel>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState title="No resumes uploaded" description="Upload a resume to unlock grounded Resume Fit, Skill Gaps, and Draft Intro guidance." icon={FileUp} />
      )}
    </motion.div>
  );
}
