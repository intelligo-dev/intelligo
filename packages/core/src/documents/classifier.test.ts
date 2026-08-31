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
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["finance report"],
    });

    expect(classifyDocumentTitle("My FINANCE REPORT 2026")).toEqual({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
    });
  });

  it("checks patterns in registration order and returns the first match", () => {
    registerDocumentPatterns({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["report"],
    });
    registerDocumentPatterns({
      productSlug: "travel",
      agentLabel: "Travel Planner",
      patterns: ["report"],
    });

    expect(classifyDocumentTitle("Quarterly report").productSlug).toBe(
      "finance"
    );
  });

  it("isProductDocument is true for any registered product when none is specified", () => {
    registerDocumentPatterns({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["finance"],
    });

    expect(isProductDocument("Finance Report")).toBe(true);
    expect(isProductDocument("Random note")).toBe(false);
  });

  it("isProductDocument scopes to a specific productSlug when given", () => {
    registerDocumentPatterns({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["finance"],
    });

    expect(isProductDocument("Finance Report", "finance")).toBe(true);
    expect(isProductDocument("Finance Report", "travel")).toBe(false);
  });

  it("listRegisteredDocumentPatterns reflects registrations", () => {
    expect(listRegisteredDocumentPatterns()).toHaveLength(0);
    registerDocumentPatterns({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["finance"],
    });
    expect(listRegisteredDocumentPatterns()).toHaveLength(1);
  });

  it("clearDocumentPatternRegistry empties the registry", () => {
    registerDocumentPatterns({
      productSlug: "finance",
      agentLabel: "Finance Advisor",
      patterns: ["finance"],
    });
    clearDocumentPatternRegistry();
    expect(listRegisteredDocumentPatterns()).toHaveLength(0);
    expect(classifyDocumentTitle("finance report").agentLabel).toBe(
      "AI Assistant"
    );
  });
});
