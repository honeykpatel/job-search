import { BriefcaseBusiness, ClipboardList, Compass, FileText, Home, Settings, Sparkles } from "lucide-react";

export const PRODUCT_LOOP = ["Discover", "Review", "Tailor", "Track", "Follow up"];

export const NAV_ITEMS = [
  { id: "home", label: "Home", icon: Home },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "pipeline", label: "Pipeline", icon: ClipboardList },
  { id: "resumes", label: "Resumes", icon: FileText },
  { id: "coach", label: "Coach", icon: Sparkles },
  { id: "settings", label: "Settings", icon: Settings },
];

export const PIPELINE_STAGES = ["Saved", "Applied", "Interview", "Offer", "Rejected", "Archived"];

export const PRIORITIES = ["High", "Medium", "Low"];

export const SAVE_REASONS = [
  "Strong fit",
  "Stretch role",
  "Interesting company",
  "Referral target",
  "Backup option",
];

export const WORK_STYLES = ["remote", "hybrid", "onsite"];

export const GROUNDING_COPY = {
  job: "Based on this job description and selected resume.",
  pipeline: "Based on your pipeline status, saved jobs, and notes.",
  coach: "Based on your saved jobs, resumes, pipeline status, and recent notes.",
};

export const EMPTY_ICONS = {
  Compass,
};
