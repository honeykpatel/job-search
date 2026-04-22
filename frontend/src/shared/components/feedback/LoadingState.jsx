export function LoadingState({ label = "Loading workspace" }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-state__dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
