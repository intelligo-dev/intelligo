/**
 * What an application tells the chat transport, and what it is told back.
 *
 * Two things are required — the execution boundary and a way to turn a
 * model id into a model — because those are the two things a framework
 * must never guess (ADR-0003, ADR-0007). Everything else has a default
 * that gives a clean install a working chat with no API keys: one
 * agent, one prompt, no tools, a window of forty messages, a truncated
 * first line as the title.
 *
 * Each optional field is a seam a real product needed and used to
 * fork the route to get: an agent resolved per conversation from a
 * table, a history pruned and summarised before the model sees it,
 * image attachments, reasoning streamed to the client, a model-written
 * title, telemetry on every turn. None of them carry product
 * vocabulary; all of them close over the caller's tenancy so the model
 * never has to be told which workspace it is in.
 */

import type { LanguageModel, StopCondition, ToolSet, UIMessage } from "ai";

import type { Conversation } from "@intelligo-dev/core/conversations";
import type { Executions } from "@intelligo-dev/executions";

import type { ChatAttachmentPolicy } from "./body";
import type { ChatErrorCode } from "./client";
import type { ChatMessages } from "./errors";
import type { TokenUsage } from "./usage";
import type { ConversationWindowOptions } from "./windowing";

export type { ChatAttachmentPolicy } from "./body";
export type { ChatMessages, ChatMessageKey, ChatMessageParams } from "./errors";

/** The resolved caller. Every read and write is scoped to this pair. */
export interface ChatActor {
  workspaceId: string;
  userId: string;
}

/** What is known about a turn before the agent is resolved. */
export interface ChatTurnContext extends ChatActor {
  request: Request;
  conversationId: string;
  /**
   * Fields the client transport sent beyond the AI SDK's own — an
   * `agentId`, a model choice. Opaque to the transport; `resolveAgent`
   * reads them.
   */
  body: Record<string, unknown>;
  /** The existing row, or null on a conversation's first turn. */
  conversation: Conversation | null;
  trigger: "submit-message" | "regenerate-message" | undefined;
}

/** The agent this turn runs as. */
export interface ResolvedAgent {
  /** Stored on the conversation row when the transport creates it. */
  id: string;
  systemPrompt: string;
  tools?: ToolSet;
  /** Names the model may call this turn; every tool when omitted. */
  activeTools?: string[];
  /** Added after `stepCountIs(maxSteps)`, e.g. `hasToolCall("askUser")`. */
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  /** Overrides `model.defaultId`. Must be a registered model id. */
  modelId?: string;
  maxSteps?: number;
  /** Overrides the config's; `null` disables the gate for this agent. */
  featureKey?: string | null;
  capability?: string;
}

/** A turn with its agent resolved — what the hooks below receive. */
export interface ChatTurn extends ChatTurnContext {
  agent: ResolvedAgent;
  /** The persisted history, read lazily: not every `prepareMessages` needs it. */
  history: () => Promise<UIMessage[]>;
}

/** What the model is shown. */
export interface PreparedTurn {
  messages: UIMessage[];
  /** Replaces the agent's system prompt when set — a summary prefix, injected context. */
  system?: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
  limit?: number;
  remaining?: number;
  resetAt?: Date;
}

export interface ChatTurnEvents {
  /** The execution is open and the model is about to run. */
  start?: (event: {
    turn: ChatTurn;
    executionId: string;
    requestId: string;
    modelId: string;
  }) => void | Promise<void>;
  /** The run settled — after a normal finish, or after the client aborted. */
  complete?: (event: {
    turn: ChatTurn;
    executionId: string;
    modelId: string;
    usage: TokenUsage;
    aborted: boolean;
    finishReason?: string;
    rawFinishReason?: string;
    providerMetadata?: unknown;
    warnings?: unknown[];
  }) => void | Promise<void>;
  /** Something threw. `phase` says where; the turn may or may not have an agent yet. */
  fail?: (event: {
    turn: ChatTurnContext;
    error: unknown;
    phase: "stream" | "settlement" | "persistence" | "title" | "unhandled";
  }) => void | Promise<void>;
  /** The transport answered with a refusal rather than a stream. */
  refuse?: (event: {
    actor: ChatActor | null;
    conversationId: string | null;
    code: ChatErrorCode;
    status: number;
    reasonCode?: string;
  }) => void | Promise<void>;
}

export interface ChatServerConfig {
  /** The execution boundary, with its ports bound by the composition root. */
  executions: Executions;
  model: {
    /** Must be registered in `@intelligo-dev/executions/pricing`. */
    defaultId: string;
    resolve: (
      modelId: string,
      turn: ChatTurnContext
    ) => LanguageModel | Promise<LanguageModel>;
  };

  /** Runs first on every request — the place to call `composeIntelligo()`. */
  onRequest?: () => void | Promise<void>;
  /** Plan feature key gating the surface. `null` disables the gate. Default `"chat"`. */
  featureKey?: string | null;
  /** Capability recorded on each execution. Default `"chat.message"`. */
  capability?: string;
  /** Longest user message accepted, in characters. Default 8000. */
  maxMessageLength?: number;
  /** Model steps one turn may take (a tool call and the reply using it are two). Default 5. */
  maxSteps?: number;

  /**
   * The one-agent shorthand. Ignored when `resolveAgent` is set.
   * `tools` may close over the turn's tenancy.
   */
  agent?: {
    /** Default `"assistant"`. */
    id?: string;
    systemPrompt?: string;
    tools?: ToolSet | ((turn: ChatTurnContext) => ToolSet | Promise<ToolSet>);
  };
  /**
   * Which agent runs this turn — from the body, the row, a table. The
   * default resolves `agent`, keeping the id the conversation was
   * created with.
   */
  resolveAgent?: (
    turn: ChatTurnContext
  ) => ResolvedAgent | Promise<ResolvedAgent>;
  /**
   * What the model is shown. The default windows the incoming
   * transcript by `windowing`. An application that prunes, summarises
   * or injects context binds its own; `turn.history()` reads the
   * persisted messages when the client's copy is not to be trusted.
   */
  prepareMessages?: (
    turn: ChatTurn,
    incoming: UIMessage[]
  ) => PreparedTurn | Promise<PreparedTurn>;
  /** Default `{ maxMessages: 40 }`; `false` shows the model everything. */
  windowing?: ConversationWindowOptions | false;
  /** File parts the transport accepts. Default `false`: any file part is a 400. */
  attachments?: ChatAttachmentPolicy | false;
  /** Stream the model's reasoning parts to the client. Default false. */
  reasoning?: boolean;

  /**
   * Titles a conversation from its first user message when the row is
   * created. Sync: stored on create. Async: the row is created untitled,
   * renamed when the promise resolves, and the client is sent a
   * transient `data-chat-title` part. Default: first line, truncated.
   */
  deriveTitle?: (
    firstUserText: string,
    turn: ChatTurnContext
  ) => string | null | Promise<string | null>;
  /**
   * Where the turn's messages go. Default: the user message that
   * opened the turn and the assistant reply, upserted through core.
   * `false` persists nothing.
   */
  persist?:
    | false
    | ((
        turn: ChatTurn,
        result: {
          userMessage: UIMessage | null;
          responseMessage: UIMessage;
          isContinuation: boolean;
        }
      ) => Promise<void>);
  /** Adjusts what settlement records — a floor for providers that report nothing. */
  normalizeUsage?: (usage: TokenUsage) => TokenUsage;
  /** Merged into the execution's metadata on begin and complete. */
  metadata?: (turn: ChatTurn) => Record<string, unknown>;
  onTurn?: ChatTurnEvents;

  /** Localised refusal copy. Default: English. */
  messages?: (request: Request) => ChatMessages | Promise<ChatMessages>;
  /** Default: `requireWorkspace()`. Throw to answer 401. */
  authenticate?: (request: Request) => Promise<ChatActor>;
  /** Default: the workspace plan's per-minute limit. `false` disables. */
  rateLimit?: false | ((actor: ChatActor) => Promise<RateLimitDecision>);
}
