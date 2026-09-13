/**
 * The parts vocabulary a chat UI, a tool and a runtime binding share.
 *
 * The AI SDK's own parts come first: `text`, `reasoning`, `tool-*` and
 * `dynamic-tool` (with their approval states), `source-url`,
 * `source-document`, `file` and `step-start` are rendered as they
 * arrive, whatever produced them — `streamText`, a Mastra agent
 * through `@mastra/ai-sdk`, or an eve session through a consumer's
 * `streamTurn` binding. A `data-chat-*` part exists only where the SDK
 * has nothing: a deferred title, a live status line, a task plan, a
 * subagent, a document streaming into the canvas, a question or an
 * authorization a runtime paused on.
 *
 * Type-only: this module imports nothing at runtime, so
 * `@intelligo-dev/chat/client` stays free of the server handler.
 */

import type { DataUIPart, UIMessage, UIMessageChunk } from "ai";

import type { TokenUsage } from "./usage";

/** A live line under the reply — "Searching the web…". One per `id`; transient. */
export type ChatStatusData = {
  label: string;
  phase?: "thinking" | "searching" | "tool" | "writing";
  done?: boolean;
};

export type ChatTaskStatus = "pending" | "in_progress" | "done" | "failed";

export type ChatTaskItem = {
  id: string;
  title: string;
  status: ChatTaskStatus;
};

/** A plan the agent is working through. Reconciled by `id`; persisted. */
export type ChatTaskData = {
  id: string;
  title: string;
  status: ChatTaskStatus;
  items?: ChatTaskItem[];
};

/** A delegated agent — eve's `subagent.*`, Mastra's networks and nested agents. */
export type ChatAgentData = {
  id: string;
  name: string;
  status: "started" | "completed" | "failed";
  parentId?: string;
  summary?: string;
};

/**
 * A document streaming into the canvas. Deltas travel as transient
 * parts under the same `id`; the final `ready` part is persisted so the
 * card reopens the document after a reload.
 */
export type ChatArtifactData = {
  id: string;
  kind: string;
  title: string;
  status: "streaming" | "ready" | "error";
  documentId?: string;
  version?: number;
  /** The whole content, when the writer was asked to persist it. */
  content?: string;
  /** One streamed increment; only on transient parts. */
  delta?: string;
  error?: string;
};

export type ChatQuestionOption = {
  id: string;
  label: string;
  description?: string;
};

/** A runtime paused for an answer that is not a tool approval. */
export type ChatQuestionData = {
  id: string;
  prompt: string;
  options?: ChatQuestionOption[];
  allowFreeform?: boolean;
  multiple?: boolean;
  answered?: boolean;
  answer?: string;
};

/** A connection that needs the user to sign in before the run continues. */
export type ChatAuthorizationData = {
  id: string;
  name: string;
  status: "required" | "completed";
  description?: string;
  instructions?: string;
  url?: string;
};

export type ChatCompactionData = { status: "requested" | "completed" };

export type ChatDataParts = {
  /** A title written after the first reply. Transient. */
  "chat-title": string;
  "chat-status": ChatStatusData;
  "chat-task": ChatTaskData;
  "chat-agent": ChatAgentData;
  "chat-artifact": ChatArtifactData;
  "chat-question": ChatQuestionData;
  "chat-authorization": ChatAuthorizationData;
  "chat-compaction": ChatCompactionData;
  /** A structured result the turn was asked for. */
  "chat-result": unknown;
};

export type ChatDataPartName = keyof ChatDataParts;

/** What the transport attaches to an assistant message once it finishes. */
export type ChatMessageMetadata = {
  modelId?: string;
  usage?: TokenUsage;
  /** ISO-8601. */
  finishedAt?: string;
  /** The reader's feedback, folded in by the UI from the votes table. */
  vote?: "up" | "down";
};

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;

export type ChatDataPart = DataUIPart<ChatDataParts>;

export type ChatUIMessageChunk = UIMessageChunk<
  ChatMessageMetadata,
  ChatDataParts
>;

/** The chunks a tool or a binding may write mid-turn through `turn.write`. */
export type ChatDataChunk = Extract<
  ChatUIMessageChunk,
  { type: `data-${string}` }
>;

/** Narrow an unknown part to one of this vocabulary's data parts. */
export function isChatDataPart<NAME extends ChatDataPartName>(
  part: unknown,
  name: NAME
): part is { type: `data-${NAME}`; id?: string; data: ChatDataParts[NAME] } {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === `data-${name}`
  );
}
