"use client";

/**
 * How a tool, and any runtime's data part, shows up in the chat.
 *
 * This is the extension point a product uses most. Adding a tool to
 * the agent is one entry in `TOOL_RENDERERS` below — a plain object
 * literal in source you own; there is no `register()` call, nothing
 * runs as an import side effect (ADR-0005), and a product package's
 * card compiles against the structural props here rather than against
 * the AI SDK's types.
 *
 * A tool call is either a row in the activity stream — the one-line
 * "Searched the web ▸" the agent's work folds into — or its own card.
 * A tool with no entry is a row. An entry is a component (a card), or
 * `{ component?, label?, activity?, sources?, canvas? }`:
 *
 *   - `component` draws the call as its own card, in every state the
 *     SDK has (`input-streaming` → `output-available`, and the approval
 *     states of a gated tool). Without one the call is a row.
 *   - `label` is a message key naming the call in its row and in the
 *     stream's status line, in place of the tool's raw name
 *     ("Generating report…").
 *   - `activity` builds the call's row when the default is not enough.
 *     The default reads the input's first string as the target, and a
 *     call whose input has a `query` renders as a search, its results
 *     from `sources`.
 *   - `sources` reads the sources the call's output carries, which
 *     become the answer's citations. The default reads `output.sources`
 *     (`{ url, title?, domain?, snippet?, index? }[]`).
 *   - `canvas` says the tool's output also lives in the side panel
 *     (`lib/chat-canvas-config.tsx` decides how a `kind` renders). A
 *     document the tool streams with `createArtifactWriter` opens the
 *     canvas by itself; a card's Open reopens it.
 *
 * `actions` is what a card can do back to the conversation: send the
 * next user turn (a quiz option, a suggested reply), answer a tool
 * that runs client-side, approve or deny a gated call, open or close
 * the canvas.
 *
 * `DATA_RENDERERS` is the same seam for `data-*` parts — what a
 * Mastra workflow, an eve subagent or a product's own `turn.write`
 * emits. The framework's `data-chat-*` parts have renderers in
 * `components/chat/data-parts.tsx`; Mastra's arrive under their own
 * names and render on the activity timeline.
 */

import type { ComponentType } from "react";
import type { FileUIPart } from "ai";
import { useTranslations } from "next-intl";

import { ArtifactCard } from "@/components/chat/artifact-card";
import type {
  AgentActivitySearch,
  AgentActivityTool,
} from "@/components/ui/ai-agent-activity";
import {
  ToolResult,
  ToolResultOutput,
  type ToolResultStatus,
} from "@/components/ui/ai-tool-result";
import type { SourceItem } from "@/lib/message-parts";

import {
  ChatAgentCard,
  ChatArtifactCard,
  ChatAuthorizationCard,
  ChatQuestionCard,
  ChatTaskCard,
} from "@/components/chat/data-parts";
import {
  MastraNetworkActivity,
  MastraToolAgentActivity,
  MastraToolAgentStepActivity,
  MastraWorkflowActivity,
  MastraWorkflowStepActivity,
} from "@/components/chat/agent-activity";

/**
 * Mirrors the AI SDK's `ToolUIPart`/`DynamicToolUIPart` state union
 * structurally rather than importing it, so a product package does
 * not pin itself to the SDK's exact tool generics. The three
 * `approval-*`/`output-denied` states only appear for tools using the
 * SDK's human-in-the-loop approval flow — a plain tool never produces
 * them.
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

/** What opens in the canvas. */
export type CanvasRef = {
  /** Stable across streamed updates — the artifact part's id or the document id. */
  id: string;
  kind: string;
  title: string;
  documentId?: string;
  /** Content already in hand, so the panel can open without a fetch. */
  content?: string;
  status?: "streaming" | "ready" | "error";
};

/** What a renderer can do back to the conversation. */
export interface ToolRendererActions {
  /** Send the next user turn — a picked option, a suggested reply. */
  sendMessage: (
    message: string | { text: string; files?: FileUIPart[] }
  ) => void;
  /** Answer a tool the client executes. */
  addToolResult: (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;
  /** Approve or deny a gated call; the SDK continues the turn. */
  addToolApprovalResponse: (args: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
  openCanvas: (ref: CanvasRef) => void;
  closeCanvas: () => void;
}

export interface ToolRendererProps {
  toolName: string;
  state: ToolPartState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** The AI SDK's id for this call — required by `addToolResult`. */
  toolCallId?: string;
  /** Set while the call awaits or received an approval. */
  approvalId?: string;
  messageId: string;
  /** The message this part belongs to is still streaming. */
  isStreaming: boolean;
  /** A read-only surface — the shared page. Cards hide their controls. */
  isReadonly: boolean;
  actions?: ToolRendererActions;
}

/** A call's row in the activity stream; the stream assigns the id. */
export type ToolActivityRow =
  | Omit<AgentActivitySearch, "id">
  | Omit<AgentActivityTool, "id">;

export interface ToolRenderer {
  /** Draws the call as its own card. Without one the call is a row in the activity stream. */
  component?: ComponentType<ToolRendererProps>;
  /** A message key (namespace-less, like `chatConfig.starters`) naming the call. */
  label?: string;
  /** The call's row, when the default row is not enough. `null` keeps the default. */
  activity?: (props: ToolRendererProps) => ToolActivityRow | null;
  /** The sources the call's output carries. Default: `output.sources`. */
  sources?: (output: unknown) => SourceItem[];
  /**
   * The tool's output also lives in the canvas, as this kind, when its
   * result does not say. A document the tool streams through
   * `createArtifactWriter` opens the canvas by itself.
   */
  canvas?: { kind: string };
}

export interface DataRendererProps {
  /** The part name without the `data-` prefix. */
  name: string;
  id?: string;
  data: unknown;
  messageId: string;
  isStreaming: boolean;
  isReadonly: boolean;
  actions?: ToolRendererActions;
}

/**
 * Tool name → how its call renders.
 *
 * Ships with one entry: `saveArtifact`, the convention this catalogue
 * uses for "the assistant produced a document." Its card links into
 * the `artifacts` page and opens the document in the canvas.
 *
 * Add your own the same way:
 *
 *   import { WeatherCard } from "@/components/chat/tools/weather-card";
 *
 *   export const TOOL_RENDERERS: Record<string, ToolRenderer | ComponentType<ToolRendererProps>> = {
 *     saveArtifact: { component: ArtifactLinkCard, canvas: { kind: "text" } },
 *     getWeather: WeatherCard,
 *     lookupInvoice: { label: "invoices.lookingUp" },
 *     generateReport: { component: ReportCard, label: "reports.generating", canvas: { kind: "text" } },
 *   };
 */
export const TOOL_RENDERERS: Record<
  string,
  ToolRenderer | ComponentType<ToolRendererProps>
> = {
  saveArtifact: { component: ArtifactLinkCard, canvas: { kind: "text" } },
};

/**
 * `data-*` part name (without the prefix) → its renderer. The
 * framework's own parts and Mastra's are shipped; a product adds the
 * parts its tools write with `turn.write`.
 */
export const DATA_RENDERERS: Record<string, ComponentType<DataRendererProps>> =
  {
    "chat-task": ChatTaskCard,
    "chat-agent": ChatAgentCard,
    "chat-artifact": ChatArtifactCard,
    "chat-question": ChatQuestionCard,
    "chat-authorization": ChatAuthorizationCard,
    workflow: MastraWorkflowActivity,
    "workflow-step": MastraWorkflowStepActivity,
    network: MastraNetworkActivity,
    "tool-agent": MastraToolAgentActivity,
    "tool-agent-step": MastraToolAgentStepActivity,
  };

export function resolveToolRenderer(
  toolName: string
): ToolRenderer & { component: ComponentType<ToolRendererProps> } {
  const entry = TOOL_RENDERERS[toolName];
  if (!entry) return { component: DefaultToolCard };
  if (typeof entry === "function") return { component: entry };
  return { ...entry, component: entry.component ?? DefaultToolCard };
}

/** Whether a tool has an entry of its own. */
export function hasToolRenderer(toolName: string): boolean {
  return toolName in TOOL_RENDERERS;
}

/** Whether a tool's call draws its own card rather than a row in the activity stream. */
export function hasToolCard(toolName: string): boolean {
  const entry = TOOL_RENDERERS[toolName];
  if (!entry) return false;
  return typeof entry === "function" || Boolean(entry.component);
}

/** Kept for cards written against the earlier seam. */
export function getToolRenderer(
  toolName: string
): ComponentType<ToolRendererProps> {
  return resolveToolRenderer(toolName).component;
}

export function getDataRenderer(
  name: string
): ComponentType<DataRendererProps> | null {
  return DATA_RENDERERS[name] ?? null;
}

/** Maps a tool part's state to its `chat.toolCard.*` message key. */
const STATE_MESSAGE_KEY: Record<ToolPartState, string> = {
  "input-streaming": "toolCard.calling",
  "input-available": "toolCard.running",
  "approval-requested": "toolCard.needsApproval",
  "approval-responded": "toolCard.approved",
  "output-available": "toolCard.done",
  "output-error": "toolCard.error",
  "output-denied": "toolCard.denied",
};

const TOOL_RESULT_STATUS: Record<ToolPartState, ToolResultStatus> = {
  "input-streaming": "running",
  "input-available": "running",
  "approval-requested": "running",
  "approval-responded": "running",
  "output-available": "success",
  "output-error": "error",
  "output-denied": "cancelled",
};

/** `webSearch` → "Web search". */
export function toolLabel(toolName: string): string {
  const spaced = toolName
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The call with its raw input and output. The activity stream shows
 * this under a row the reader opens; a card that has nothing better to
 * show yet can draw it too.
 */
export function DefaultToolCard({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolRendererProps) {
  const t = useTranslations("chat");
  const status = TOOL_RESULT_STATUS[state];
  const outputText =
    errorText ??
    (output === undefined
      ? undefined
      : typeof output === "string"
        ? output
        : JSON.stringify(output, null, 2));

  return (
    <ToolResult
      className="max-w-xl"
      tool={toolName}
      title={toolLabel(toolName)}
      status={status}
      kind="custom"
      statusLabels={{
        running: t(STATE_MESSAGE_KEY[state]),
        success: t("toolCard.done"),
        error: t("toolCard.error"),
        cancelled: t("toolCard.denied"),
      }}
      copyLabel={t("actions.copy")}
      copiedLabel={t("actions.copied")}
      copyText={outputText}
    >
      {input !== undefined ? (
        <div className="grid gap-1 px-3 pt-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("toolCard.input")}
          </span>
          <ToolResultOutput language="json">
            {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
          </ToolResultOutput>
        </div>
      ) : null}
      {outputText !== undefined ? (
        <div className="grid gap-1 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {errorText ? t("toolCard.errorHeading") : t("toolCard.output")}
          </span>
          <ToolResultOutput language={errorText ? "text" : "json"}>
            {outputText}
          </ToolResultOutput>
        </div>
      ) : null}
    </ToolResult>
  );
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Renderer for a tool that produces a document. While the model writes
 * the call, the card shows the title and the last lines of the content
 * as they arrive; once the tool returns a `title` (and optionally a
 * `documentId`, `kind` and `content`) the whole card opens it. A
 * finished call with no title falls back to the generic card, so a tool
 * whose shape drifts renders honestly rather than blank.
 *
 * Opening lands in the canvas when the page has one, and on the
 * document's preview on the `/artifacts` page otherwise.
 */
export function ArtifactLinkCard(props: ToolRendererProps) {
  const { toolName, state, input, output, errorText, messageId, isReadonly, actions } =
    props;
  const t = useTranslations("chat");

  const result =
    output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  const draft =
    input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  const title = stringField(result, "title") ?? stringField(draft, "title");

  if (state === "output-available" && !title) return <DefaultToolCard {...props} />;

  const kind =
    stringField(result, "kind") ??
    stringField(draft, "kind") ??
    resolveToolRenderer(toolName).canvas?.kind ??
    "text";
  const status =
    state === "output-error" || state === "output-denied"
      ? "error"
      : state === "output-available"
        ? "ready"
        : "streaming";
  const documentId = stringField(result, "documentId") ?? stringField(result, "id");
  const content = stringField(result, "content");
  const ref: CanvasRef = {
    id: documentId ?? messageId,
    kind,
    title: title ?? "",
    ...(documentId ? { documentId } : {}),
    ...(content !== undefined ? { content } : {}),
    status: "ready",
  };
  const canOpen = status === "ready" && !isReadonly;

  return (
    <ArtifactCard
      title={title || t("artifactCard.untitled")}
      kind={kind}
      status={status}
      error={errorText}
      preview={stringField(draft, "content")}
      onOpen={canOpen && actions ? () => actions.openCanvas(ref) : undefined}
      href={
        canOpen && !actions && documentId
          ? `/artifacts?document=${encodeURIComponent(documentId)}`
          : undefined
      }
    />
  );
}
