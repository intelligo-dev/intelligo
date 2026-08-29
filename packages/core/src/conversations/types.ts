/**
 * Shared types for the conversations service.
 */

/** Resolved actor identity — every query is scoped to this pair. */
export type ConversationActor = {
  workspaceId: string;
  userId: string;
};

export type {
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  Vote,
  InsertVote,
  ConversationMetadata,
} from "../db/schema";
