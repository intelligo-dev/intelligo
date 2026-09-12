/**
 * @intelligo-dev/chat — the AI-SDK-native chat transport.
 *
 * A Route Handler as a function: `createChatHandler(config)` returns
 * `{ POST, DELETE }` over Web `Request`/`Response`, and runs every turn
 * through auth, rate limit, feature gate, conversation persistence and
 * the execution boundary. The UI is not here — it installs from the
 * registry as consumer-owned source (ADR-0002, ADR-0010) and imports
 * only `@intelligo-dev/chat/client`.
 *
 * Not an agent abstraction (ADR-0003): the config takes AI SDK tools,
 * an AI SDK model and AI SDK stop conditions, natively. A Mastra agent
 * records executions through `@intelligo-dev/mastra` instead.
 */

export { createChatHandler, truncateTitle } from "./handler";
export type { ChatHandler } from "./handler";

export type {
  ChatActor,
  ChatAttachmentPolicy,
  ChatMessageKey,
  ChatMessageParams,
  ChatMessages,
  ChatServerConfig,
  ChatTurn,
  ChatTurnContext,
  ChatTurnEvents,
  PreparedTurn,
  RateLimitDecision,
  ResolvedAgent,
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

export { CHAT_ERROR_CODES, parseChatError } from "./client";
export type { ChatErrorBody, ChatErrorCode, ChatQuotaState } from "./client";
