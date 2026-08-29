// Re-export database client
export * from "./client";

// Re-export database validation utilities
export * from "./validate";

// Re-export workspace-scoped query helpers (Phase 10)
export { workspaceEq, withWorkspaceFilter } from "./workspace-queries";

// This file will later also re-export schema types and helpers
