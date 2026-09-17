/**
 * @intelligo-dev/chat — the AI-SDK-native chat transport.
 *
 * A Route Handler as a function: `createChatHandler(config)` returns
 * `{ POST, DELETE, GET }` over Web `Request`/`Response`, and runs every
 * turn through auth, rate limit, feature gate, conversation persistence
 * and the execution boundary. The UI is not here — it installs from the
 * registry as consumer-owned source (ADR-0002, ADR-0010) and imports
 * only `@intelligo-dev/chat/client`.
 *
 * Not an agent abstraction (ADR-0003): the config takes AI SDK tools,
 * an AI SDK model and AI SDK stop conditions, natively, and `streamTurn`
 * takes the AI SDK's own UI message chunks from whatever runtime a
 * consumer binds. The framework carries no helper for any of them.
 */

export { createChatHandler } from "./handler";
export { truncateTitle } from "./title";
export type { ChatHandler } from "./handler";

export type {
  ChatActor,
  ChatAgentConfig,
  ChatAttachmentPolicy,
  ChatGenerationOptions,
  ChatMessageKey,
  ChatMessageParams,
  ChatMessages,
  ChatModelsConfig,
  ChatServerConfig,
  ChatTurn,
  ChatTurnContext,
  ChatTurnEvents,
  PreparedTurn,
  ProviderOptions,
  RateLimitDecision,
  ResolvedAgent,
  StreamTurn,
  TurnStream,
} from "./config";

export { CHAT_ERROR_STATUS, DEFAULT_CHAT_MESSAGES } from "./errors";
export { parseChatBody } from "./body";
export type { ChatBody, ParsedChatBody } from "./body";

export { getChatQuotaState } from "./quota";
export { lastUserMessage, toUIMessages } from "./messages";
export { pickUsage, sumStepUsage } from "./usage";
export type { TokenUsage } from "./usage";
export {
  applyConversationWindow,
  estimateConversationTokens,
  estimateTokenCount,
  extractText,
} from "./windowing";
export type {
  ConversationWindow,
  ConversationWindowOptions,
} from "./windowing";

export { createArtifactWriter } from "./artifact-writer";
export type { ArtifactWriter, ArtifactWriterOptions } from "./artifact-writer";
export { sanitizeForShare } from "./share";
export type { SharePolicy } from "./share";
export { recordChatFeedback } from "./feedback";
export type { ChatFeedback, RecordChatFeedbackResult } from "./feedback";
export {
  createChatAttachmentHandler,
  createChatUploadHandler,
} from "./attachments";
export type {
  ChatAttachmentHandler,
  ChatUploadHandler,
  ChatUploadResult,
} from "./attachments";

export { CHAT_ERROR_CODES, parseChatError, isChatDataPart } from "./client";
export type {
  ChatErrorBody,
  ChatErrorCode,
  ChatModelOption,
  ChatQuotaState,
} from "./client";
export type {
  ChatAgentData,
  ChatArtifactData,
  ChatAuthorizationData,
  ChatCompactionData,
  ChatDataChunk,
  ChatDataPart,
  ChatDataPartName,
  ChatDataParts,
  ChatMessageMetadata,
  ChatQuestionData,
  ChatQuestionOption,
  ChatStatusData,
  ChatTaskData,
  ChatTaskItem,
  ChatTaskStatus,
  ChatUIMessage,
  ChatUIMessageChunk,
} from "./parts";
