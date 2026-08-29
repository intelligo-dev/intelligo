"use client";

/**
 * Tool-call renderer seam.
 *
 * `@intelligo-dev/chat`'s dissolving package (ADR-0008) kept a runtime
 * `Map` that a product registered into at client bootstrap — a
 * package-level registry a consumer could never see, let alone edit.
 * This item's replacement is the opposite of clever: `TOOL_RENDERERS`
 * below is a plain object literal in source you own. Add a tool name
 * → component entry to it directly; there is no `register()` call to
 * invoke from a composition root, and nothing here runs as an import
 * side effect, so ADR-0005 has nothing to enforce against this file.
 *
 * A tool with no entry falls back to `DefaultToolCard`: a generic
 * collapsible view of the tool's raw input/output JSON. It exists so
 * a new tool call always renders *something* honest while you're
 * wiring up its real card — it is not meant to be your product's
 * shipped UI for that tool.
 *
 * `components/chat/message.tsx` calls `getToolRenderer(toolName)` for
 * every `tool-*`/`dynamic-tool` part it renders.
 */

import { type ComponentType, useState } from "react";
import { useTranslations } from "use-intl";
import { ChevronDown, ChevronRight, FileText, Wrench } from "lucide-react";

import { Link } from "@showcase/i18n/navigation";

/**
 * Mirrors the AI SDK's `ToolUIPart`/`DynamicToolUIPart` state union
 * (`ai`'s `dist/index.d.ts`) structurally rather than importing it, so
 * this file doesn't pin a consumer to the SDK's exact tool-generics
 * shape. The three `approval-*`/`output-denied` states only appear for
 * tools using the SDK's human-in-the-loop approval flow — a plain tool
 * never produces them.
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

/**
 * What a renderer can do back to the conversation. Passed to every
 * renderer, so an *interactive* tool card — approve/deny, pick one of
 * several options, submit a form the tool asked for — is possible
 * without reaching around the component tree.
 *
 * `addToolResult` answers the tool call the card is rendering (pass
 * its `toolCallId`); `sendMessage` sends a new user turn instead.
 */
export interface ToolRendererActions {
  sendMessage: (text: string) => void;
  addToolResult: (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;
}

export interface ToolRendererProps {
  toolName: string;
  state: ToolPartState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  /** The AI SDK's id for this call — required by `addToolResult`. */
  toolCallId?: string;
  /** Present when the message list passes them; see above. */
  actions?: ToolRendererActions;
}

/**
 * Map of AI SDK tool name → the component that renders its call and
 * result.
 *
 * Ships with one entry: `saveArtifact`, the convention this catalogue
 * uses for "the assistant produced a document." Bind a tool of that
 * name in `@/lib/chat-server-config` and its result renders as a card
 * linking into the `artifacts` page. Rename the key if your tool is
 * called something else.
 *
 * Add your own the same way — this is a plain object literal in source
 * you own, with no `register()` call anywhere:
 *
 *   import { WeatherCard } from "@showcase/components/chat/weather-card";
 *
 *   export const TOOL_RENDERERS: Record<string, ComponentType<ToolRendererProps>> = {
 *     saveArtifact: ArtifactLinkCard,
 *     getWeather: WeatherCard,
 *   };
 */
export const TOOL_RENDERERS: Record<
  string,
  ComponentType<ToolRendererProps>
> = {
  saveArtifact: ArtifactLinkCard,
};

export function getToolRenderer(
  toolName: string
): ComponentType<ToolRendererProps> {
  return TOOL_RENDERERS[toolName] ?? DefaultToolCard;
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
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-[85%] rounded-lg border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{toolLabel(toolName)}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {t(STATE_MESSAGE_KEY[state])}
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t px-3 py-2">
          {input !== undefined ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {JSON.stringify(input, null, 2)}
            </pre>
          ) : null}
          {output !== undefined ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(output, null, 2)}
            </pre>
          ) : null}
          {errorText ? (
            <p className="text-xs text-destructive">{errorText}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renderer for a tool that produced a document artifact. Expects the
 * tool's output to carry a `title` (and optionally a `documentId`);
 * anything else falls back to the generic card, so a tool whose shape
 * drifts renders honestly rather than blank.
 *
 * This is the chat↔artifacts affordance: a reply that generated a
 * document says so inline, and links to where the document lives.
 */
export function ArtifactLinkCard({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolRendererProps) {
  const t = useTranslations("chat");

  const title =
    output && typeof output === "object" && "title" in output
      ? String((output as { title: unknown }).title)
      : undefined;

  if (state !== "output-available" || !title) {
    return (
      <DefaultToolCard
        toolName={toolName}
        state={state}
        input={input}
        output={output}
        errorText={errorText}
      />
    );
  }

  return (
    <div className="flex max-w-[85%] items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">
          {t("artifactCard.saved")}
        </p>
      </div>
      <Link
        href="/artifacts"
        className="shrink-0 text-xs font-medium text-primary hover:underline"
      >
        {t("artifactCard.open")}
      </Link>
    </div>
  );
}
