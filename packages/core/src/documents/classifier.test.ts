import { describe, it, expect, afterEach } from "vitest";
import {
  registerDocumentPatterns,
  classifyDocumentTitle,
  isProductDocument,
  listRegisteredDocumentPatterns,
  clearDocumentPatternRegistry,
} from "./classifier";

describe("document classifier registry", () => {
  afterEach(() => {
    clearDocumentPatternRegistry();
  });

  it("returns the AI Assistant fallback when nothing is registered", () => {
    expect(classifyDocumentTitle("My TODO")).toEqual({
      productSlug: null,
      agentLabel: "AI Assistant",
    });
  });

  it("matches a registered pattern case-insensitively", () => {
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["support report"],
    });

    expect(classifyDocumentTitle("My SUPPORT REPORT 2026")).toEqual({
      productSlug: "support",
      agentLabel: "Support Assistant",
    });
  });

  it("checks patterns in registration order and returns the first match", () => {
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["report"],
    });
    registerDocumentPatterns({
      productSlug: "study",
      agentLabel: "Study Planner",
      patterns: ["report"],
    });

    expect(classifyDocumentTitle("Quarterly report").productSlug).toBe(
      "support"
    );
  });

  it("isProductDocument is true for any registered product when none is specified", () => {
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["support"],
    });

    expect(isProductDocument("Support Report")).toBe(true);
    expect(isProductDocument("Random note")).toBe(false);
  });

  it("isProductDocument scopes to a specific productSlug when given", () => {
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["support"],
    });

    expect(isProductDocument("Support Report", "support")).toBe(true);
    expect(isProductDocument("Support Report", "study")).toBe(false);
  });

  it("listRegisteredDocumentPatterns reflects registrations", () => {
    expect(listRegisteredDocumentPatterns()).toHaveLength(0);
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["support"],
    });
    expect(listRegisteredDocumentPatterns()).toHaveLength(1);
  });

  it("clearDocumentPatternRegistry empties the registry", () => {
    registerDocumentPatterns({
      productSlug: "support",
      agentLabel: "Support Assistant",
      patterns: ["support"],
    });
    clearDocumentPatternRegistry();
    expect(listRegisteredDocumentPatterns()).toHaveLength(0);
    expect(classifyDocumentTitle("support report").agentLabel).toBe(
      "AI Assistant"
    );
  });
});
