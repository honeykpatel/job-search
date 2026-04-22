import { useId } from "react";

export function Field({ label, hint, error, children }) {
  const hintId = useId();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
}
