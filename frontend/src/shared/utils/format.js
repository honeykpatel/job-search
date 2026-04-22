import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

export function parseDate(value) {
  if (!value) return null;
  const parsed = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(parsed) ? parsed : null;
}

export function formatDate(value, fallback = "Not set") {
  const parsed = parseDate(value);
  return parsed ? format(parsed, "MMM d, yyyy") : fallback;
}

export function relativeDate(value) {
  const parsed = parseDate(value);
  return parsed ? `${formatDistanceToNow(parsed)} ago` : "Recently";
}

export function fitLabel(score) {
  const normalized = Number(score || 0);
  if (normalized >= 0.68) return { label: "Strong", tone: "strong", explanation: "Resume signals align well with the job requirements." };
  if (normalized >= 0.42) return { label: "Moderate", tone: "moderate", explanation: "There is useful overlap, with a few areas to tailor." };
  return { label: "Limited", tone: "limited", explanation: "The fit needs more evidence or a better-matched resume." };
}

export function fitLabelFromInsights(insights) {
  if (!insights) return fitLabel(0);
  const percent = Number(insights.match_percent ?? insights.match_percentage ?? insights.resume_fit ?? 0);
  return fitLabel(percent > 1 ? percent / 100 : percent);
}

export function compactText(value, fallback = "Not provided") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function initials(nameOrEmail) {
  const text = String(nameOrEmail || "JP").trim();
  const parts = text.includes("@") ? [text[0], text.split("@")[1]?.[0]] : text.split(/\s+/);
  return parts
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function normalizeStatus(status) {
  const raw = String(status || "Saved").trim().toLowerCase();
  if (raw === "interviewing") return "Interview";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Saved";
}

export function getJobId(job) {
  return job?.id || job?.job_id || "";
}

export function getJobTitle(job) {
  return job?.title || job?.job_title || "Untitled role";
}

export function getJobCompany(job) {
  return job?.company || "Company not listed";
}

export function getJobLocation(job) {
  return job?.location || "Location not listed";
}
