import { create } from "zustand";
import { persist } from "zustand/middleware";

const defaultAnnotation = {
  priority: "Medium",
  nextStep: "",
  dueDate: "",
  saveReason: "",
};

// These fields are UX-only for now because the redesign intentionally avoids backend schema changes.
// Persisting them locally keeps the new workflow usable without corrupting existing API contracts.
export const useJobAnnotations = create(
  persist(
    (set, get) => ({
      annotations: {},
      getAnnotation(jobId) {
        return { ...defaultAnnotation, ...(get().annotations[jobId] || {}) };
      },
      updateAnnotation(jobId, patch) {
        if (!jobId) return;
        set((state) => ({
          annotations: {
            ...state.annotations,
            [jobId]: { ...defaultAnnotation, ...(state.annotations[jobId] || {}), ...patch },
          },
        }));
      },
    }),
    { name: "jobpilot-job-annotations-v1" }
  )
);
