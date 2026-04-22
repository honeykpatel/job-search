import { cn } from "../../lib/utils";

export function Panel({ children, className, as: Component = "section", ...props }) {
  return (
    <Component className={cn("ui-panel", className)} {...props}>
      {children}
    </Component>
  );
}

export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="section-header__action">{action}</div> : null}
    </div>
  );
}
