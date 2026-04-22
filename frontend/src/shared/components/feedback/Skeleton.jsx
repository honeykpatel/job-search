export function Skeleton({ className = "" }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function PageSkeleton({ variant = "default" }) {
  const rows = variant === "jobs" ? 8 : 5;
  return (
    <div className="page-skeleton" role="status" aria-label="Loading page">
      <div className="page-skeleton__header">
        <Skeleton className="w-24 h-3" />
        <Skeleton className="w-64 h-9" />
        <Skeleton className="w-96 h-4" />
      </div>
      <div className="page-skeleton__grid">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <Skeleton className="w-32 h-3" />
            <Skeleton className="w-full h-5" />
            <Skeleton className="w-2/3 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
