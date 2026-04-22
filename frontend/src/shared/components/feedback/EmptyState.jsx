import { Compass } from "lucide-react";
import { Button } from "../ui/Button";

export function EmptyState({ title, description, actionLabel, onAction, icon: Icon = Compass }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon size={22} />
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
