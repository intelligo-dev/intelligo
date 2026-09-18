/** Resolved actor identity — every query is scoped to this pair. */
export type DocumentActor = {
  workspaceId: string;
  userId: string;
};

export type DocumentFilter = {
  type?: "all" | "report" | "text" | "code" | "sheet" | "image";
};

export type DocumentListItem = {
  id: string;
  title: string;
  kind: string;
  createdAt: string; // ISO string, so it serializes to the client
  agentLabel: string;
  content: string | null;
  /**
   * The conversation this document was written in, when known. Read from
   * `metadata.conversationId` rather than a column: a document may also be
   * written from a job or an import.
   */
  conversationId: string | null;
};
