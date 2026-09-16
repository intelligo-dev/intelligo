"use client";

/**
 * A run of the agent's own work — its reasoning and the tool calls
 * between its words — as one activity stream: live while it runs, then
 * a one-line summary ("Searched the web ▸") the reader opens on demand.
 *
 * Each call becomes a row. The default reads the call itself: an input
 * with a `query` is a search whose results are the sources the output
 * carries; anything else is the tool's label and its first string
 * input. A tool's entry in `TOOL_RENDERERS` can name the call (`label`)
 * or build its row (`activity`). The raw input and output stay one
 * click away, under the row — never on the page by default.
 */

import { getToolName, isReasoningUIPart, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useTranslations } from "use-intl";
import { Streamdown } from "streamdown";

import {
  AgentActivity,
  type AgentActivityItem,
} from "@showcase/components/ui/ai-agent-activity";
import { CodeBlock } from "@showcase/components/ui/ai-code-block";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@showcase/components/ui/ai-reasoning";
import {
  resolveToolRenderer,
  toolLabel,
  type ToolActivityRow,
  type ToolRendererProps,
} from "@showcase/lib/chat-renderers";
import {
  isSettledToolState,
  primaryInput,
  sourceDomain,
  sourcesFromToolOutput,
  titleFromUrl,
  type PartAt,
} from "@showcase/lib/message-parts";

type Part = UIMessage["parts"][number];

/** Results shown under a search before "+N more". */
const VISIBLE_RESULTS = 4;

interface ToolActivityProps {
  parts: PartAt<Part>[];
  working: boolean;
  /** The renderer props for one tool part — the same ones a card gets. */
  toolProps: (part: Part) => ToolRendererProps;
}

export function ToolActivity({ parts, working, toolProps }: ToolActivityProps) {
  const t = useTranslations("chat");
  const tAny = useTranslations();

  // Thinking alone reads as thinking: the reasoning disclosure, timed.
  if (parts.every(({ part }) => isReasoningUIPart(part))) {
    const text = parts
      .map(({ part }) => (part as { text: string }).text)
      .join("\n\n");
    return (
      <Reasoning isStreaming={working}>
        <ReasoningTrigger
          getThinkingMessage={(streaming, duration) =>
            streaming
              ? t("message.thinking")
              : duration === undefined
                ? t("message.thoughtBriefly")
                : t("message.thoughtFor", { seconds: duration })
          }
        />
        <ReasoningContent>{text}</ReasoningContent>
      </Reasoning>
    );
  }

  const items: AgentActivityItem[] = [];
  let searches = 0;
  let tools = 0;
  let liveLabel: string | null = null;

  for (const { index, part } of parts) {
    const id = `part-${index}`;

    if (isReasoningUIPart(part)) {
      items.push({
        id,
        type: "text",
        content: (
          <Streamdown className="text-sm text-muted-foreground [&_p]:my-1 first:[&_p]:mt-0 last:[&_p]:mb-0">
            {part.text}
          </Streamdown>
        ),
      });
      continue;
    }

    if (!isToolUIPart(part)) continue;
    const props = toolProps(part);
    const renderer = resolveToolRenderer(getToolName(part));
    const name = renderer.label
      ? tAny(renderer.label)
      : toolLabel(props.toolName);
    const row =
      renderer.activity?.(props) ??
      defaultRow(props, name, renderer.sources, t);
    const details = <ToolCallDetails {...props} />;

    if (row.type === "search") searches += 1;
    else tools += 1;
    if (row.status === "running") {
      liveLabel =
        row.type === "search" ? t("toolActivity.searching") : `${name}…`;
    }
    items.push({
      ...row,
      id,
      details: row.details ?? details,
    } as AgentActivityItem);
  }

  const summary =
    searches > 0 && tools > 0
      ? t("toolActivity.searchedAndRan", { count: tools })
      : searches > 0
        ? t("toolActivity.searched")
        : tools > 0
          ? t("toolActivity.ranTools", { count: tools })
          : t("toolActivity.thought");

  return (
    <AgentActivity
      className="max-w-2xl"
      // Room for a row the reader opened onto its call.
      maxHeight={working ? 208 : 480}
      items={items}
      status={working ? "working" : "complete"}
      activeLabel={liveLabel ?? t("toolActivity.working")}
      summary={summary}
      moreLabel={(count) => t("toolActivity.more", { count })}
    />
  );
}

function defaultRow(
  props: ToolRendererProps,
  name: string,
  readSources:
    | ((output: unknown) => ReturnType<typeof sourcesFromToolOutput>)
    | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): ToolActivityRow {
  const status =
    props.state === "output-error" || props.state === "output-denied"
      ? "error"
      : isSettledToolState(props.state)
        ? "complete"
        : "running";
  const input = props.input as Record<string, unknown> | undefined;
  const query = typeof input?.query === "string" ? input.query : undefined;

  if (query !== undefined && status !== "error") {
    const sources = (readSources ?? sourcesFromToolOutput)(props.output);
    return {
      type: "search",
      query,
      status,
      results: sources.slice(0, VISIBLE_RESULTS).map((source, index) => {
        const domain = sourceDomain(source);
        const title =
          (source.title && source.title !== domain
            ? source.title
            : undefined) ?? titleFromUrl(source.url);
        return {
          id: source.url ?? `${index}`,
          title: title ?? domain ?? source.url ?? "",
          ...(domain && title ? { domain } : {}),
          ...(source.url ? { url: source.url } : {}),
        };
      }),
      moreCount: Math.max(0, sources.length - VISIBLE_RESULTS),
    };
  }

  return {
    type: "tool",
    action: name,
    status,
    target:
      props.state === "output-denied"
        ? t("toolActivity.denied", { tool: name })
        : props.state === "output-error"
          ? (props.errorText ?? t("toolActivity.failed", { tool: name }))
          : primaryInput(props.input),
  };
}

/** The call as it happened: what went in, what came back. */
function ToolCallDetails({ input, output, errorText }: ToolRendererProps) {
  const t = useTranslations("chat");
  const blocks: Array<{
    label: string;
    code: string;
    language: "json" | "text";
  }> = [];
  if (input !== undefined) {
    blocks.push({
      label: t("toolActivity.input"),
      code: stringify(input),
      language: "json",
    });
  }
  if (errorText) {
    blocks.push({
      label: t("toolActivity.error"),
      code: errorText,
      language: "text",
    });
  } else if (output !== undefined) {
    blocks.push({
      label: t("toolActivity.output"),
      code: stringify(output),
      language: "json",
    });
  }
  if (blocks.length === 0) return null;

  return (
    <div className="grid gap-2">
      {blocks.map((block) => (
        <div key={block.label} className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {block.label}
          </span>
          <CodeBlock
            code={block.code}
            language={block.language}
            className="text-xs [&_pre]:max-h-48 [&_pre]:overflow-auto [&_pre]:p-2.5! [&_pre]:text-xs! [&_pre]:break-words [&_pre]:whitespace-pre-wrap"
          />
        </div>
      ))}
    </div>
  );
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
