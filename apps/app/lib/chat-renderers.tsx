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
 * An entry is either a component, or `{ component, label, canvas }`:
 *
 *   - `component` renders the call in the transcript, in every state
 *     the SDK has (`input-streaming` → `output-available`, and the
 *     approval states of a gated tool).
 *   - `label` is a message key shown while the call streams, in place
 *     of the tool's raw name ("Generating report…").
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
 *
 * A tool with no entry falls back to `DefaultToolCard` — the T3 Tool
 * part with the raw input and output, so a new tool always renders
 * something honest while its card is being written.
 */

import type { ComponentType } from "react";
import type { FileUIPart, ToolUIPart } from "ai";
import { useTranslations } from "next-intl";
import { FileTextIcon } from "lucide-react";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ui/ai-tool";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Link } from "@/i18n/navigation";

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

export interface ToolRenderer {
  component: ComponentType<ToolRendererProps>;
  /** A message key (namespace-less, like `chatConfig.starters`) shown while the call streams. */
  label?: string;
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

export function resolveToolRenderer(toolName: string): ToolRenderer {
  const entry = TOOL_RENDERERS[toolName];
  if (!entry) return { component: DefaultToolCard };
  return typeof entry === "function" ? { component: entry } : entry;
}

/** Whether a tool has its own card, or falls back to the default one. */
export function hasToolRenderer(toolName: string): boolean {
  return toolName in TOOL_RENDERERS;
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

function toolLabel(toolName: string): string {
  const spaced = toolName.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function DefaultToolCard({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolRendererProps) {
  const t = useTranslations("chat");

  return (
    <Tool className="max-w-xl">
      <ToolHeader
        title={toolLabel(toolName)}
        type={`tool-${toolName}`}
        state={state as ToolUIPart["state"]}
        stateLabel={t(STATE_MESSAGE_KEY[state])}
      />
      <ToolContent>
        {input !== undefined ? (
          <ToolInput input={input} label={t("toolCard.input")} />
        ) : null}
        <ToolOutput
          output={output}
          errorText={errorText}
          label={errorText ? t("toolCard.errorHeading") : t("toolCard.output")}
        />
      </ToolContent>
    </Tool>
  );
}

/**
 * Renderer for a tool that produced a document. Expects the tool's
 * output to carry a `title` (and optionally a `documentId`, `kind`
 * and `content`); anything else falls back to the generic card, so a
 * tool whose shape drifts renders honestly rather than blank.
 *
 * Opening lands in the canvas when the page has one, and on the
 * `/artifacts` page otherwise.
 */
export function ArtifactLinkCard({
  toolName,
  state,
  input,
  output,
  errorText,
  messageId,
  isStreaming,
  isReadonly,
  actions,
}: ToolRendererProps) {
  const t = useTranslations("chat");

  const result =
    output && typeof output === "object"
      ? (output as {
          title?: unknown;
          documentId?: unknown;
          id?: unknown;
          kind?: unknown;
          content?: unknown;
        })
      : null;
  const title = typeof result?.title === "string" ? result.title : undefined;

  if (state !== "output-available" || !title) {
    return (
      <DefaultToolCard
        toolName={toolName}
        state={state}
        input={input}
        output={output}
        errorText={errorText}
        messageId={messageId}
        isStreaming={isStreaming}
        isReadonly={isReadonly}
      />
    );
  }

  const documentId =
    typeof result?.documentId === "string"
      ? result.documentId
      : typeof result?.id === "string"
        ? result.id
        : undefined;
  const ref: CanvasRef = {
    id: documentId ?? messageId,
    kind:
      typeof result?.kind === "string"
        ? result.kind
        : (resolveToolRenderer(toolName).canvas?.kind ?? "text"),
    title,
    ...(documentId ? { documentId } : {}),
    ...(typeof result?.content === "string" ? { content: result.content } : {}),
    status: "ready",
  };

  return (
    <Item variant="outline" size="sm" className="max-w-xl">
      <ItemMedia variant="icon">
        <FileTextIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{t("artifactCard.saved")}</ItemDescription>
      </ItemContent>
      {isReadonly ? null : (
        <ItemActions>
          {actions ? (
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => actions.openCanvas(ref)}
            >
              {t("artifactCard.open")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/artifacts" />}
              nativeButton={false}
            >
              {t("artifactCard.open")}
            </Button>
          )}
        </ItemActions>
      )}
    </Item>
  );
}
