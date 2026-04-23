import { MapIcon } from "@heroicons/react/24/outline";
import { Button } from "../ui/Button";

export function EmptyState({ title, description, actionLabel, onAction, icon: Icon = MapIcon }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon className="empty-state__icon-svg" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <Button type="button" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
