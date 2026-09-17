/**
 * Conversations Module
 *
 * Conversation/message lifecycle: create, list, read, rename, delete,
 * message append/window reads, vote state. See ./service.ts for the
 * full module doc comment, including what stayed product-side.
 *
 * Use via subpath import: @intelligo-dev/core/conversations
 */

export {
  createConversation,
  getConversation,
  listConversations,
  getConversationHistory,
  renameConversation,
  deleteConversation,
  deleteAllConversations,
  getMessages,
  saveMessages,
  upsertMessages,
  updateMessage,
  deleteTrailingMessages,
  voteMessage,
  getVotes,
  clearVote,
  updateConversationMetadata,
  setConversationVisibility,
  getPublicConversation,
  getPublicMessages,
} from "./service";
export type { ConversationVisibility } from "./service";

export {
  ConversationServiceError,
  isConversationServiceError,
  type ConversationServiceErrorCode,
} from "./errors";

export type {
  ConversationActor,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  Vote,
  InsertVote,
  ConversationMetadata,
} from "./types";
