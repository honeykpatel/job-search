import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../shared/components/ui/Button";
import { Field } from "../../shared/components/forms/Field";

const signInSchema = z.object({
  email: z.string().email("Use a valid email address."),
  password: z.string().min(1, "Password is required."),
});

const signUpSchema = z
  .object({
    first_name: z.string().min(1, "First name is required."),
    last_name: z.string().min(1, "Last name is required."),
    email: z.string().email("Use a valid email address."),
    username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/, "Use 3-24 letters, numbers, or underscores."),
    phone: z.string().regex(/^\D*(\d\D*){10}$/, "Phone must include 10 digits."),
    password: z.string().regex(/^(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/, "Use 6+ characters with a number and symbol."),
    confirmPassword: z.string(),
    age: z.string().optional(),
    gender: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export function AuthShell({ mode, setMode, onSubmit, onGuest, submitting, loading, error, notice, authAvailable, theme = "dark" }) {
  const schema = mode === "sign-up" ? signUpSchema : signInSchema;
  const logoSrc = theme === "light" ? "/JobPilotLogoBlue.png" : "/JobPilotLogo.png";
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), mode: "onBlur" });

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-labelledby="auth-title">
        <div className="auth-hero__brand">
          <img src={logoSrc} alt="" />
          <span>JobPilot</span>
        </div>
        <p className="eyebrow">Discover &gt; Review &gt; Tailor &gt; Track &gt; Follow up</p>
        <h1 id="auth-title">A calmer workspace for AI-assisted job search.</h1>
        <p>
          Save jobs, compare resumes, understand skill gaps, and get grounded coaching without turning the whole product
          into a chatbot.
        </p>
      </section>

      <section className="auth-card" aria-label={mode === "sign-up" ? "Create account" : "Sign in"}>
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === "sign-in" ? "is-active" : ""} onClick={() => setMode("sign-in")}>
            Sign in
          </button>
          <button type="button" className={mode === "sign-up" ? "is-active" : ""} onClick={() => setMode("sign-up")}>
            Create account
          </button>
        </div>

        {error ? <p className="form-alert form-alert--error">{error}</p> : null}
        {notice ? <p className="form-alert form-alert--success">{notice}</p> : null}

        <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
          {mode === "sign-up" ? (
            <div className="form-grid two">
              <Field label="First name" error={errors.first_name?.message}>
                <input {...register("first_name")} autoComplete="given-name" />
              </Field>
              <Field label="Last name" error={errors.last_name?.message}>
                <input {...register("last_name")} autoComplete="family-name" />
              </Field>
            </div>
          ) : null}

          <Field label="Email" error={errors.email?.message}>
            <input {...register("email")} type="email" autoComplete="email" />
          </Field>

          {mode === "sign-up" ? (
            <>
              <div className="form-grid two">
                <Field label="Username" error={errors.username?.message}>
                  <input {...register("username")} autoComplete="username" />
                </Field>
                <Field label="Phone" error={errors.phone?.message}>
                  <input {...register("phone")} inputMode="tel" autoComplete="tel" />
                </Field>
              </div>
              <div className="form-grid two">
                <Field label="Age (optional)" error={errors.age?.message}>
                  <input {...register("age")} inputMode="numeric" />
                </Field>
                <Field label="Gender (optional)" error={errors.gender?.message}>
                  <select {...register("gender")}>
                    <option value="">Prefer not to say</option>
                    <option value="woman">Woman</option>
                    <option value="man">Man</option>
                    <option value="nonbinary">Non-binary</option>
                    <option value="self-described">Self-described</option>
                  </select>
                </Field>
              </div>
            </>
          ) : null}

          <Field label="Password" error={errors.password?.message}>
            <input {...register("password")} type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} />
          </Field>
          {mode === "sign-up" ? (
            <Field label="Confirm password" error={errors.confirmPassword?.message}>
              <input {...register("confirmPassword")} type="password" autoComplete="new-password" />
            </Field>
          ) : null}

          <Button type="submit" disabled={submitting || loading || !authAvailable}>
            {submitting ? "Working..." : mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="guest-box">
          <p>Want to try JobPilot first?</p>
          <Button type="button" variant="secondary" onClick={onGuest} disabled={submitting || loading}>
            Continue as guest
          </Button>
        </div>
      </section>
    </main>
  );
}
