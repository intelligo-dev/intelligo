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
