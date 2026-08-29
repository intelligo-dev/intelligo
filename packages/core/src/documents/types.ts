/**
 * Shared types for the documents service.
 */

/** Resolved actor identity — every query is scoped to this pair. */
export type DocumentActor = {
  workspaceId: string;
  userId: string;
};

/**
 * Document filter type
 */
export type DocumentFilter = {
  type?: "all" | "report" | "text" | "code" | "sheet" | "image";
};

/**
 * Document list item returned by getUserDocuments / getDocument /
 * saveDocument / deleteDocumentVersions.
 */
export type DocumentListItem = {
  id: string;
  title: string;
  kind: string;
  createdAt: string; // ISO string for client serialization
  agentLabel: string;
  content: string | null;
};
