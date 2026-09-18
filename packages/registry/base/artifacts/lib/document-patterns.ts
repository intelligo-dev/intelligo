import "server-only";

/**
 * Title patterns that map a document to an agent label (shown on its
 * card) and to the "Reports" tab. With none registered, every document
 * gets the generic "AI Assistant" label.
 *
 * Call this exactly once, from your composition root: calling it from a
 * request-scoped file (an action, a page) would push duplicate entries
 * onto the same in-memory registry.
 */
export function registerDefaultDocumentPatterns(): void {
  // Registers nothing by default.
}

// Example: label your agent's documents and put them under "Reports"
// (replace the export above):
//
// import { registerDocumentPatterns } from "@intelligo-dev/core/documents";
//
// export function registerDefaultDocumentPatterns(): void {
//   registerDocumentPatterns({
//     productSlug: "default",
//     agentLabel: "Assistant",
//     patterns: ["report", "summary"],
//   });
// }
