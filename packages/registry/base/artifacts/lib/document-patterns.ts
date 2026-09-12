import "server-only";

/**
 * Document title-pattern registration — composition-root extension
 * point for the `artifacts` item.
 *
 * `@intelligo-dev/core/documents` keeps a small classifier registry
 * (`registerDocumentPatterns`) that maps a document's title to a human
 * agent label (rendered on every artifact card) and to the "Reports"
 * filter tab (`isProductDocument`, used by `@/actions/documents`). Per
 * ADR-0005 (no import-side-effect registration), populating that
 * registry happens once, at startup, from an explicit composition root
 * your app owns — never by importing this file for its side effects,
 * and never from a request-scoped file (a Server Action, a page) where
 * it could run more than once and push duplicate entries onto the same
 * in-memory registry.
 *
 * Ships no registrations by default: a fresh install has no product to
 * label, and the classifier already falls back to a generic "AI
 * Assistant" label with no registrations at all. Call the function
 * below exactly once, from your composition root, after adding your own
 * product's title patterns (uncomment and adjust the example call). If
 * your app already has a composition root (e.g. the pattern
 * `@/lib/ensure-composed` guards against), call it from
 * there, guarded the same way every other registration is.
 */
export function registerDefaultDocumentPatterns(): void {
  // Registers nothing by default.
}

// Example — brand documents your product's chat agent creates with a
// custom agent label and fold them into the "Reports" filter (uncomment
// and adjust; remove the no-op export above):
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
