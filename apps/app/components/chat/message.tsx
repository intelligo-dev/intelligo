"use client";

/**
 * Renders one `UIMessage`'s parts on the design system's conversation
 * components: shadcn's Message and Bubble for the turn, the
 * T3 parts for the agent's activity, sources and tools, and the seams
 * in `@/lib/chat-renderers` for tool calls and data parts. Text renders
 * with `streamdown`, the markdown-while-streaming renderer, because
 * replies are routinely lists, code and headings arriving a token at a
 * time.
 *
 * Parts are laid out by `groupParts` (`@/lib/message-parts`): the
 * agent's reasoning and the tool calls between its words fold into one
 * activity stream (`ToolActivity`); a tool with its own card, a call
 * awaiting approval, text, files and `data-*` parts (through
 * `DATA_RENDERERS`) stand on their own. A Mastra or eve turn renders
 * through the same switch.
 *
 * Sources are collected by `collectSources` — the AI SDK's `source-*`
 * parts and the sources a tool returned — so a `[3]` in the text is an
 * inline pill naming the site as soon as the search behind it settled,
 * and the finished reply ends with a sources button.
 *
 * A finished assistant message carries the action row; a user message
 * can be edited in place, which re-sends it as a new turn and keeps
 * the earlier reply as a version.
 */

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import type { FileUIPart, UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { PaperclipIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";

import { ToolApproval } from "@/components/ui/ai-tool-approval";
import {
  Branch,
  BranchNext,
  BranchPage,
  BranchPrevious,
} from "@/components/ui/ai-branch";
import {
  CitationPill,
  type CitationItem,
} from "@/components/ui/ai-citations";
import { ImageGeneration } from "@/components/ui/ai-image-generation";
import { ReasoningText } from "@/components/ui/ai-reasoning-text";
import { StreamingResponse } from "@/components/ui/ai-streaming-response";
import {
  Attachment,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import {
  MessageContent,
  MessageFooter,
  Message as MessageRow,
} from "@/components/ui/ai-message";
import {
  MessageBubble,
  MessageBubbleContent,
} from "@/components/ui/ai-message-bubble";
import { Textarea } from "@/components/ui/textarea";
import {
  getDataRenderer,
  hasToolCard,
  hasToolRenderer,
  resolveToolRenderer,
  type ToolRendererActions,
  type ToolRendererProps,
} from "@/lib/chat-renderers";
import {
  collectSources,
  groupParts,
  isActivityWorking,
  isSettledToolState,
  linkCitations,
  parseCitationHref,
  sourceDomain,
  sourcesFromSourcePart,
  sourcesFromToolOutput,
  titleFromUrl,
  type NumberedSource,
} from "@/lib/message-parts";
import { MessageActions, type MessageVote } from "./message-actions";
import { ToolActivity } from "./tool-activity";

export type MessageVersion = {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
};

interface MessageProps {
  conversationId: string;
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  /** The runtime's transient status while this reply streams. */
  statusLabel?: string | null;
  /** A read-only surface: no actions, no edit, no branch pager. */
  readOnly?: boolean;
  vote?: MessageVote;
  /** Versions of the tail that starts here, when there are several. */
  version?: MessageVersion | null;
  onRegenerate?: (messageId: string) => void;
  /** Re-send this user message with new text; the thread branches. */
  onEdit?: (messageId: string, text: string, files: FileUIPart[]) => void;
  toolActions?: ToolRendererActions;
}

type Part = UIMessage["parts"][number];

function isFilePart(part: unknown): part is FileUIPart {
  return (part as { type?: unknown }).type === "file";
}

// The plugin packages type `Pluggable` against their own `unified`
// copy; the shapes are the ones Streamdown expects.
const MARKDOWN_PLUGINS = { code, math, mermaid, cjk } as unknown as NonNullable<
  React.ComponentProps<typeof Streamdown>["plugins"]
>;

/** The message's plain text, for copying, editing and artifact content. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

/** The sources a part carries: a source part itself, or a settled tool's output. */
function sourcesOf(part: Part) {
  if (isToolUIPart(part)) {
    if (part.state !== "output-available") return [];
    const read =
      resolveToolRenderer(getToolName(part)).sources ?? sourcesFromToolOutput;
    return read(part.output);
  }
  return sourcesFromSourcePart(part);
}

function citationItem(source: NumberedSource): CitationItem {
  const domain = sourceDomain(source);
  const named =
    source.title && source.title !== domain ? source.title : undefined;
  return {
    id: source.id,
    title: named ?? titleFromUrl(source.url) ?? domain ?? source.url ?? "",
    ...(domain ? { domain } : {}),
    ...(source.url ? { url: source.url } : {}),
    ...(source.snippet ? { snippet: source.snippet } : {}),
  };
}

/**
 * The streaming caret sits at the end of the last line of markdown,
 * not under it: markdown renders as blocks, so a sibling after the
 * renderer would start a new line. A pseudo-element on the last block
 * stays inline with its text.
 */
const STREAMING_CARET =
  "[&>:last-child]:after:ml-0.5 [&>:last-child]:after:inline-block [&>:last-child]:after:h-4 [&>:last-child]:after:w-0.5 [&>:last-child]:after:animate-pulse [&>:last-child]:after:rounded-full [&>:last-child]:after:bg-foreground [&>:last-child]:after:align-text-bottom [&>:last-child]:after:content-['']";

export function Message({
  conversationId,
  message,
  isLastMessage,
  isStreaming,
  statusLabel = null,
  readOnly = false,
  vote = null,
  version = null,
  onRegenerate,
  onEdit,
  toolActions,
}: MessageProps) {
  const t = useTranslations("chat");
  const isUser = message.role === "user";
  const isStreamingThis = isLastMessage && isStreaming;
  const text = messageText(message);
  const [editing, setEditing] = useState(false);

  const hasVisibleText = message.parts.some(
    (part) => isTextUIPart(part) && part.text
  );
  const isEmptyAssistant =
    !isUser &&
    message.parts.every(
      (part) => (isTextUIPart(part) && !part.text) || part.type === "step-start"
    );

  const files = message.parts.flatMap((part) =>
    isFilePart(part) ? [part] : []
  );
  const sources = isUser ? [] : collectSources(message.parts, sourcesOf);
  const citations = new Map(
    sources.map((source) => [source.index, citationItem(source)])
  );
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (isTextUIPart(part) ? index : last),
    -1
  );
  // A document a tool returned draws once: the tool's card. The
  // streamed `data-chat-artifact` part for the same document is what
  // opened the canvas, not a second card.
  const documentsShownByTools = new Set<string>();
  // While a document tool is still running its card already shows the
  // document being written; the part it streams would be a second card.
  let documentToolRunning = false;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.state !== "output-available") {
      if (
        resolveToolRenderer(getToolName(part)).canvas &&
        !isSettledToolState(part.state)
      ) {
        documentToolRunning = true;
      }
      continue;
    }
    const output = part.output as
      { documentId?: unknown; id?: unknown } | undefined;
    const id = output?.documentId ?? output?.id;
    if (typeof id === "string") documentsShownByTools.add(id);
  }

  function toolProps(part: Part): ToolRendererProps {
    if (!isToolUIPart(part)) throw new Error("not a tool part");
    const approval =
      "approval" in part
        ? (part.approval as { id?: string } | undefined)
        : undefined;
    return {
      toolName: getToolName(part),
      state: part.state,
      input: "input" in part ? part.input : undefined,
      output: part.state === "output-available" ? part.output : undefined,
      errorText: part.state === "output-error" ? part.errorText : undefined,
      toolCallId: "toolCallId" in part ? part.toolCallId : undefined,
      approvalId: approval?.id,
      messageId: message.id,
      isStreaming: isStreamingThis,
      isReadonly: readOnly,
      actions: toolActions,
    };
  }

  // A call awaiting the reader, or a tool with a card of its own, stands
  // apart; every other call is a row in the activity stream.
  const segments = groupParts(
    message.parts,
    (part) =>
      isToolUIPart(part) &&
      (part.state === "approval-requested" || hasToolCard(getToolName(part)))
  );
  const lastSegment = segments.at(-1);
  const activityLive =
    lastSegment?.kind === "activity" &&
    isActivityWorking(lastSegment, true, isStreamingThis);

  if (isUser && editing) {
    return (
      <MessageRow from="user" className="group/chat-message">
        <MessageContent>
          <EditForm
            initial={text}
            onCancel={() => setEditing(false)}
            onSave={(next) => {
              setEditing(false);
              onEdit?.(message.id, next, files);
            }}
          />
        </MessageContent>
      </MessageRow>
    );
  }

  const markdownComponents =
    citations.size > 0
      ? {
          a: (props: React.ComponentProps<"a">) => (
            <CitationAnchor {...props} citations={citations} />
          ),
        }
      : undefined;

  function renderPart(part: Part, index: number) {
    const key = `${message.id}-${index}`;

    if (isTextUIPart(part)) {
      if (!part.text) return null;
      if (isUser) {
        return (
          <MessageBubble key={key} variant="solid">
            <MessageBubbleContent className="whitespace-pre-wrap">
              {part.text}
            </MessageBubbleContent>
          </MessageBubble>
        );
      }
      const streamingText = isStreamingThis && index === lastTextIndex;
      return (
        <MessageBubble key={key} variant="ghost">
          <MessageBubbleContent>
            <Streamdown
              className={streamingText ? STREAMING_CARET : undefined}
              mode={streamingText ? "streaming" : "static"}
              isAnimating={streamingText}
              plugins={MARKDOWN_PLUGINS}
              components={markdownComponents}
            >
              {linkCitations(part.text, new Set(citations.keys()))}
            </Streamdown>
          </MessageBubbleContent>
        </MessageBubble>
      );
    }

    if (isToolUIPart(part)) {
      const props = toolProps(part);
      if (
        part.state === "approval-requested" &&
        !hasToolRenderer(props.toolName)
      ) {
        return <ApprovalCard key={key} {...props} />;
      }
      const { component: Renderer } = resolveToolRenderer(props.toolName);
      return <Renderer key={key} {...props} />;
    }

    if (part.type.startsWith("data-")) {
      const name = part.type.slice("data-".length);
      if (name === "chat-title" || name === "chat-status") return null;
      const Renderer = getDataRenderer(name);
      if (!Renderer) return null;
      const data = part as { id?: string; data: unknown };
      if (name === "chat-artifact") {
        const artifact = data.data as { id?: string; documentId?: string };
        if (
          documentToolRunning ||
          (artifact.documentId &&
            documentsShownByTools.has(artifact.documentId)) ||
          (artifact.id && documentsShownByTools.has(artifact.id))
        ) {
          return null;
        }
      }
      return (
        <Renderer
          key={data.id ? `${message.id}-data-${data.id}` : key}
          name={name}
          id={data.id}
          data={data.data}
          messageId={message.id}
          isStreaming={isStreamingThis}
          isReadonly={readOnly}
          actions={toolActions}
        />
      );
    }

    return null;
  }

  const body = (
    <>
      {segments.map((segment, position) =>
        segment.kind === "activity" ? (
          <ToolActivity
            key={`${message.id}-${segment.key}`}
            parts={segment.parts}
            working={isActivityWorking(
              segment,
              position === segments.length - 1,
              isStreamingThis
            )}
            toolProps={toolProps}
          />
        ) : (
          renderPart(segment.part, segment.index)
        )
      )}

      {isStreamingThis &&
      !activityLive &&
      (isEmptyAssistant || statusLabel) ? (
        <ReasoningText
          phrases={[statusLabel ?? t("message.thinking")]}
          suffix=""
          variant="swap"
          className="text-sm text-muted-foreground"
        />
      ) : null}
    </>
  );

  const footerControls =
    !readOnly && !isStreamingThis && (hasVisibleText || version) ? (
      <>
        {version ? (
          <Branch
            index={version.index}
            count={version.count}
            onIndexChange={version.onIndexChange}
            className="mr-1"
          >
            <BranchPrevious label={t("branch.previous")} />
            <BranchPage />
            <BranchNext label={t("branch.next")} />
          </Branch>
        ) : null}
        {hasVisibleText ? (
          <MessageActions
            conversationId={conversationId}
            messageId={message.id}
            role={isUser ? "user" : "assistant"}
            text={text}
            vote={vote}
            alwaysVisible={isLastMessage}
            onEdit={isUser && onEdit ? () => setEditing(true) : undefined}
            onRegenerate={
              !isUser && onRegenerate
                ? () => onRegenerate(message.id)
                : undefined
            }
          />
        ) : null}
      </>
    ) : null;

  return (
    <MessageRow
      from={isUser ? "user" : "assistant"}
      className="group/chat-message"
    >
      <MessageContent>
        {files.length > 0 ? (
          <AttachmentGroup className="max-w-full">
            {files.map((file, index) => (
              <FileAttachment
                key={`${message.id}-file-${index}`}
                file={file}
                generated={!isUser}
              />
            ))}
          </AttachmentGroup>
        ) : null}

        {isUser ? (
          <>
            {body}
            {footerControls ? (
              <MessageFooter>{footerControls}</MessageFooter>
            ) : null}
          </>
        ) : (
          // The reply's footer — its actions and a sources disclosure —
          // rises in once the stream settles.
          <StreamingResponse
            status={isStreamingThis ? "streaming" : "complete"}
            announce={false}
            prose={false}
            sources={isStreamingThis ? [] : [...citations.values()]}
            sourcesLabel={(count) => t("sources.title", { count })}
            actions={footerControls}
            className="min-w-0"
            contentClassName="flex min-w-0 flex-col items-start gap-1.5"
            actionsClassName="gap-1"
          >
            {body}
          </StreamingResponse>
        )}
      </MessageContent>
    </MessageRow>
  );
}

/** `[n]` markers render as source pills; every other link stays a link. */
function CitationAnchor({
  href,
  children,
  citations,
  ...props
}: React.ComponentProps<"a"> & { citations: Map<number, CitationItem> }) {
  const t = useTranslations("chat");
  const numbers = parseCitationHref(href);
  if (numbers) {
    const cited = numbers.flatMap((n) => {
      const citation = citations.get(n);
      return citation ? [citation] : [];
    });
    const first = cited[0];
    if (first) {
      return (
        <CitationPill
          citations={cited}
          label={t("sources.pill", {
            name: first.domain ?? String(first.title),
          })}
        />
      );
    }
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

function FileAttachment({
  file,
  generated,
}: {
  file: FileUIPart;
  /** The assistant made it: an image resolves in rather than just appearing. */
  generated: boolean;
}) {
  const t = useTranslations("chat");
  const isImage = file.mediaType.startsWith("image/") && Boolean(file.url);
  if (isImage && generated) {
    return (
      <ImageGeneration
        className="max-w-sm"
        status="complete"
        showStatus={false}
        interactive={false}
      >
        <img
          src={file.url}
          alt={file.filename ?? t("message.imageAlt")}
          className="size-full object-cover"
        />
      </ImageGeneration>
    );
  }
  if (isImage) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="block max-w-xs overflow-hidden rounded-xl border"
      >
        <img
          src={file.url}
          alt={file.filename ?? t("message.imageAlt")}
          className="block h-auto w-full"
        />
      </a>
    );
  }
  return (
    <Attachment size="sm">
      <AttachmentMedia variant="icon">
        <PaperclipIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>
          {file.filename ?? t("message.attachment")}
        </AttachmentTitle>
      </AttachmentContent>
    </Attachment>
  );
}

/** Edit a user message in place. ⌘/Ctrl+Enter saves, Esc cancels. */
function EditForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("chat");
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <form
      className="flex w-full max-w-2xl flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Textarea
        ref={ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
          }
        }}
        className="min-h-20"
        aria-label={t("actions.edit")}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("actions.editCancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!value.trim()}>
          {t("actions.editSave")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The default for a call that waits on the reader: a permission card
 * with the tool's input as parameters. Allow, or deny with a reason —
 * the answer rides the approval response, the part moves on to
 * `approval-responded`, and the call joins the activity stream as a
 * row. The decision lives in the part, so it survives a reload.
 */
function ApprovalCard({
  toolName,
  input,
  approvalId,
  isReadonly,
  actions,
}: ToolRendererProps) {
  const t = useTranslations("chat");
  const parameters =
    input && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>).map(
          ([key, value]) => ({
            id: key,
            label: key,
            value: typeof value === "string" ? value : JSON.stringify(value),
          })
        )
      : [];
  const canDecide = !isReadonly && Boolean(actions) && Boolean(approvalId);

  function decide(approved: boolean, reason?: string) {
    if (!approvalId || !actions) return;
    actions.addToolApprovalResponse({
      id: approvalId,
      approved,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    });
  }

  return (
    <ToolApproval
      className="max-w-xl"
      tool={toolName}
      title={t("approval.title", { tool: toolName })}
      description={t("approval.description")}
      parameters={parameters}
      status="pending"
      denyReason
      onAllow={canDecide ? () => decide(true) : undefined}
      onDeny={canDecide ? (reason) => decide(false, reason) : undefined}
      allowOnceLabel={t("approval.allow")}
      denyLabel={t("approval.deny")}
      cancelLabel={t("approval.cancel")}
      detailsLabel={t("approval.details")}
      denyReasonPlaceholder={t("approval.reasonPlaceholder")}
      statusLabels={{
        pending: t("approval.pending"),
        approved: t("approval.approved"),
        denied: t("approval.denied"),
      }}
    />
  );
}
