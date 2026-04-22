import { describe, expect, it } from "vitest";
import { fitLabel, getJobCompany, getJobTitle, normalizeStatus } from "./format";

describe("format utilities", () => {
  it("maps resume fit scores to trust-friendly labels", () => {
    expect(fitLabel(0.8).label).toBe("Strong");
    expect(fitLabel(0.5).label).toBe("Moderate");
    expect(fitLabel(0.2).label).toBe("Limited");
  });

  it("normalizes backend status labels for the Pipeline", () => {
    expect(normalizeStatus("interviewing")).toBe("Interview");
    expect(normalizeStatus("applied")).toBe("Applied");
    expect(normalizeStatus("")).toBe("Saved");
  });

  it("keeps job display fallbacks readable", () => {
    expect(getJobTitle({})).toBe("Untitled role");
    expect(getJobCompany({})).toBe("Company not listed");
  });
});
