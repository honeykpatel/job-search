import { Button } from "../../shared/components/ui/Button";
import { Panel, SectionHeader } from "../../shared/components/ui/Panel";
import { Field } from "../../shared/components/forms/Field";

export function SettingsPage({ profile, account, onProfileSave, onAccountSave, profileDraft, setProfileDraft, accountDraft, setAccountDraft, saving }) {
  return (
    <div className="settings-grid">
      <Panel>
        <SectionHeader
          title="AI grounding profile"
          description="This tells Career Coach what background, goals, and constraints to use. Better context means less generic advice."
        />
        <form className="stack-form" onSubmit={(event) => { event.preventDefault(); onProfileSave(); }}>
          <Field label="Career summary" hint="Include target roles, strongest skills, industries, location constraints, and anything the AI should not assume.">
            <textarea rows={6} value={profileDraft.summary_text ?? profile?.summary_text ?? ""} onChange={(event) => setProfileDraft({ ...profileDraft, summary_text: event.target.value })} />
          </Field>
          <Button type="submit" disabled={saving}>Save profile</Button>
        </form>
      </Panel>
      <Panel>
        <SectionHeader title="Account display" description="Shown in the sidebar and workspace header. This does not change your resume content." />
        <form className="stack-form" onSubmit={(event) => { event.preventDefault(); onAccountSave(); }}>
          <Field label="First name">
            <input value={accountDraft.first_name ?? account?.first_name ?? ""} onChange={(event) => setAccountDraft({ ...accountDraft, first_name: event.target.value })} />
          </Field>
          <Field label="Last name">
            <input value={accountDraft.last_name ?? account?.last_name ?? ""} onChange={(event) => setAccountDraft({ ...accountDraft, last_name: event.target.value })} />
          </Field>
          <Field label="Username">
            <input value={accountDraft.username ?? account?.username ?? ""} onChange={(event) => setAccountDraft({ ...accountDraft, username: event.target.value })} />
          </Field>
          <Button type="submit" disabled={saving}>Save account</Button>
        </form>
      </Panel>
    </div>
  );
}
