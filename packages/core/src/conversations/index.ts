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
} from "./service";
export {
  setConversationVisibility,
  getPublicConversation,
  getPublicMessages,
  shareRef,
} from "./sharing";
export type { ConversationVisibility } from "./sharing";

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
