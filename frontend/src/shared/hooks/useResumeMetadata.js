import { create } from "zustand";
import { persist } from "zustand/middleware";

const defaultMetadata = {
  targetRole: "",
};

export const useResumeMetadata = create(
  persist(
    (set, get) => ({
      metadata: {},
      getMetadata(resumeId) {
        return { ...defaultMetadata, ...(get().metadata[resumeId] || {}) };
      },
      updateMetadata(resumeId, patch) {
        if (!resumeId) return;
        set((state) => ({
          metadata: {
            ...state.metadata,
            [resumeId]: { ...defaultMetadata, ...(state.metadata[resumeId] || {}), ...patch },
          },
        }));
      },
    }),
    { name: "jobpilot-resume-metadata-v1" }
  )
);
