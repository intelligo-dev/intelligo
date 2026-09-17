/**
 * What an application tells the chat transport, and what it is told back.
 *
 * Two things are required — the execution boundary and a way to run
 * the model — because those are the two things a framework must never
 * guess. Everything else has a default that gives
 * a clean install a working chat with no API keys: one agent, one
 * prompt, no tools, a window of forty messages, a truncated first line
 * as the title.
 *
 * Each optional field is a seam a real product needed and used to fork
 * the route to get: an agent resolved per conversation from a table, a
 * history pruned and summarised before the model sees it, image
 * attachments, reasoning streamed to the client, a model-written
 * title, telemetry on every turn, a model picker, a runtime that is not
 * `streamText`. None of them carry product vocabulary; all of them
 * close over the caller's tenancy so the model never has to be told
 * which workspace it is in.
 *
 * `streamTurn` is the one runtime seam. It replaces the model call and
 * nothing else: auth, the rate limit, the feature gate, admission,
 * persistence and settlement stay the transport's. What it returns is
 * the AI SDK's own UI message chunks — a Mastra agent produces them
 * through `@mastra/ai-sdk`, an eve session through a mapper the
 * consumer installs from the registry — so the framework carries no
 * helper for any AI framework.
 */

import type {
  LanguageModel,
  StopCondition,
  ToolSet,
  UIMessage,
  UIMessageChunk,
  UIMessageStreamWriter,
} from "ai";
import type { streamText } from "ai";

/** The provider-specific options `streamText` accepts (`ai` does not export the type). */
export type ProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

import type { Conversation } from "@intelligo-dev/core/conversations";
import type { Executions } from "@intelligo-dev/executions";

import type { ChatAttachmentPolicy } from "./body";
import type { ChatErrorCode, ChatModelOption } from "./client";
import type { ChatMessages } from "./errors";
import type { ChatGenerationOptions } from "./generation";
import type { ChatDataChunk, ChatUIMessage } from "./parts";
import type { TokenUsage } from "./usage";
import type { ConversationWindowOptions } from "./windowing";

export type { ChatAttachmentPolicy } from "./body";
export type { ChatMessages, ChatMessageKey, ChatMessageParams } from "./errors";
export type { ChatGenerationOptions } from "./generation";

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
   * `agentId`, a `modelId`. Opaque to the transport; `resolveAgent`
   * reads them. `modelId` is also read by the default resolution when
   * `models` is configured.
   */
  body: Record<string, unknown>;
  /** The existing row, or null on a conversation's first turn. */
  conversation: Conversation | null;
  trigger: "submit-message" | "regenerate-message" | undefined;
  /**
   * Write a part to the client mid-turn — a status line, a task plan,
   * a document streaming into the canvas (`createArtifactWriter`). A
   * no-op before the stream opens and after it closes, so a tool bound
   * through `agent.tools` may hold on to it.
   */
  write: (chunk: ChatDataChunk) => void;
  /**
   * Merge a patch into the conversation's `metadata` — a runtime's
   * session id, a summary of pruned history. Shallow: top-level keys
   * are replaced, other keys kept. Rejects before the row exists.
   */
  updateMetadata: (patch: Record<string, unknown>) => Promise<void>;
}

/** The agent this turn runs as. */
export interface ResolvedAgent {
  /** Stored on the conversation row when the transport creates it. */
  id: string;
  systemPrompt: string;
  tools?: ToolSet;
  /** Names the model may call this turn; every tool when omitted. */
  activeTools?: string[];
  /**
   * Added after `stepCountIs(maxSteps)`, e.g. `hasToolCall("askUser")`.
   *
   * Consulted only on a turn that has tools: the SDK stops a run on
   * this condition "when there are tool results in the last step", and
   * a turn with no tools never has any, so it is a single step either
   * way. The step cap itself is not removable — an uncapped step count
   * is an uncapped bill.
   */
  stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[];
  /** Overrides the request's and the config's model. Must be a registered model id. */
  modelId?: string;
  maxSteps?: number;
  /** Overrides the config's; `null` disables the gate for this agent. */
  featureKey?: string | null;
  capability?: string;
  /**
   * Passed to `streamText` as-is — the provider's own knobs, e.g. a
   * thinking budget (`{ google: { thinkingConfig: { includeThoughts: true } } }`,
   * `{ anthropic: { thinking: { type: "enabled", budgetTokens: 2048 } } }`).
   * With `reasoning: true` this is what makes a model's thoughts reach
   * the transcript at all; the transport never names a provider.
   */
  providerOptions?: ProviderOptions;
  /**
   * How the model samples this turn — temperature, a token ceiling, a
   * tool choice, a seed. An allowlist of the `streamText` options that
   * do not touch settlement; see `ChatGenerationOptions` for what the
   * transport keeps and why.
   */
  generation?: ChatGenerationOptions;
}

/**
 * The one-agent shorthand, derived from `ResolvedAgent` so the two
 * cannot drift: everything a `resolveAgent` function can return is
 * settable here too, and the three fields below are the only ones that
 * differ — an id and a prompt because the transport has defaults for
 * them, and tools because the shorthand may close over the turn.
 */
export interface ChatAgentConfig extends Omit<
  ResolvedAgent,
  "id" | "systemPrompt" | "tools"
> {
  /** Default `"assistant"`. */
  id?: string;
  systemPrompt?: string;
  tools?: ToolSet | ((turn: ChatTurnContext) => ToolSet | Promise<ToolSet>);
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

/**
 * A turn produced by something other than `streamText`.
 *
 * `stream` carries the AI SDK's UI message chunks. The transport writes
 * `start` and `finish` itself and drops any the stream emits, so a
 * runtime whose adapter already frames the message needs no stripping.
 * `usage` settles the execution: it resolves once the run is over,
 * with the whole run's tokens. On a client abort the transport settles
 * with whatever `usage` resolves to; reject it and the turn is failed.
 */
export interface TurnStream {
  stream: ReadableStream<UIMessageChunk>;
  usage: Promise<
    TokenUsage & {
      modelId?: string;
      finishReason?: string;
    }
  >;
}

export type StreamTurn = (
  turn: ChatTurn,
  prepared: PreparedTurn,
  context: {
    modelId: string;
    abortSignal: AbortSignal;
    writer: UIMessageStreamWriter<ChatUIMessage>;
  }
) => TurnStream | Promise<TurnStream>;

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
  /**
   * The user answered a tool's approval request. Fired once per
   * response, from the continuation turn that carries it — the audit
   * trail a product needs for a gated action.
   */
  approval?: (event: {
    turn: ChatTurnContext;
    toolName: string;
    toolCallId: string;
    approvalId: string;
    approved: boolean;
    reason?: string;
  }) => void | Promise<void>;
  /** The reader voted on a reply, or cleared a vote. */
  feedback?: (event: {
    actor: ChatActor;
    conversationId: string;
    messageId: string;
    vote: "up" | "down" | null;
  }) => void | Promise<void>;
}

export interface ChatModelsConfig {
  /**
   * Models the request may ask for by `modelId`. A list, or a function
   * of the caller for a list that depends on the plan. A request naming
   * a model outside it, or one whose `featureKey` the workspace lacks,
   * is refused as `FEATURE_GATED` with reason `model_not_allowed`.
   */
  options:
    | ChatModelOption[]
    | ((actor: ChatActor) => ChatModelOption[] | Promise<ChatModelOption[]>);
}

export interface ChatServerConfig {
  /** The execution boundary, with its ports bound by the composition root. */
  executions: Executions;
  model: {
    /** Must be registered in `@intelligo-dev/executions/pricing`. */
    defaultId: string;
    /**
     * Turns a model id into a model for `streamText`. Required unless
     * `streamTurn` is set, and unused when it is.
     */
    resolve?: (
      modelId: string,
      turn: ChatTurnContext
    ) => LanguageModel | Promise<LanguageModel>;
  };
  /**
   * Runs the turn instead of `streamText` — a Mastra agent, an eve
   * session, a workflow. Everything around the model call stays the
   * transport's. See `TurnStream`.
   */
  streamTurn?: StreamTurn;

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
  agent?: ChatAgentConfig;
  /**
   * Which agent runs this turn — from the body, the row, a table. The
   * default resolves `agent`, keeping the id the conversation was
   * created with.
   */
  resolveAgent?: (
    turn: ChatTurnContext
  ) => ResolvedAgent | Promise<ResolvedAgent>;
  /** The models a request may pick from. Unset: every request runs the default. */
  models?: ChatModelsConfig;
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
  /** Stream the model's source parts (citations) to the client. Default false. */
  sources?: boolean;
  /**
   * Attach `{ modelId, usage, finishedAt }` to the assistant message as
   * its metadata when the turn finishes. Default true.
   */
  messageMetadata?: boolean;
  /**
   * Answer cross-origin requests from these origins — an embedded
   * widget on another site. Unset: no CORS headers, same-origin only.
   */
  cors?: { origins: readonly string[] };

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
