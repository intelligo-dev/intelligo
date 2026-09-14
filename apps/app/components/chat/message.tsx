"use client";

/**
 * Renders one `UIMessage`'s parts on the design system's conversation
 * components (ADR-0013): shadcn's Message and Bubble for the turn, the
 * T3 parts for reasoning, sources and tools, and the seams in
 * `@/lib/chat-renderers` for tool calls and data parts. Text renders
 * with `streamdown`, the markdown-while-streaming renderer, because
 * replies are routinely lists, code and headings arriving a token at a
 * time.
 *
 * Every part type the AI SDK has is handled here: `text`, `reasoning`,
 * `tool-*` / `dynamic-tool` (with approval states), `source-url` and
 * `source-document` (collected and shown once the reply is complete —
 * never mid-stream), `file` (images inline, other files as
 * attachments), `step-start` (a boundary, nothing to draw) and `data-*`
 * (through `DATA_RENDERERS`). A Mastra or eve turn renders through the
 * same switch.
 *
 * A finished assistant message carries the action row; a user message
 * can be edited in place, which re-sends it as a new turn and keeps
 * the earlier reply as a version.
 */

import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  getToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
} from "ai";
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
import { AIImage } from "@/components/ui/ai-image";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from "@/components/ui/ai-inline-citation";
import { ShimmerText } from "@/components/ui/ai-shimmer-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/ai-reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ui/ai-sources";
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
  hasToolRenderer,
  resolveToolRenderer,
  type ToolRendererActions,
  type ToolRendererProps,
} from "@/lib/chat-renderers";
import { MessageActions, type MessageVote } from "./message-actions";

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

type SourcePart = {
  type: "source-url" | "source-document";
  sourceId: string;
  url?: string;
  title?: string;
  mediaType?: string;
  filename?: string;
};

function isSourcePart(part: unknown): part is SourcePart {
  const type = (part as { type?: unknown }).type;
  return type === "source-url" || type === "source-document";
}

function isFilePart(part: unknown): part is FileUIPart {
  return (part as { type?: unknown }).type === "file";
}

// The plugin packages type `Pluggable` against their own `unified`
// copy; the shapes are the ones Streamdown expects.
const MARKDOWN_PLUGINS = { code, math, mermaid, cjk } as unknown as NonNullable<
  React.ComponentProps<typeof Streamdown>["plugins"]
>;

const CITE_PREFIX = "#cite-";

/**
 * `[3]` in a finished reply becomes a link to `#cite-3`, which the
 * anchor override below renders as a citation marker. Only once the
 * text is complete (scrimui's rule: a citation appears when the claim
 * is grounded, never while it streams) and only when the reply has
 * sources to point at.
 */
function withCitations(text: string, count: number): string {
  if (count === 0) return text;
  return text.replace(/\[(\d{1,2})\](?!\()/g, (match, n: string) => {
    const index = Number(n);
    return index >= 1 && index <= count ? `[${n}](${CITE_PREFIX}${n})` : match;
  });
}

/** The message's plain text, for copying, editing and artifact content. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
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
  const sources = isStreamingThis
    ? []
    : message.parts.flatMap((part) =>
        isSourcePart(part) && (part.url || part.title) ? [part] : []
      );
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (isTextUIPart(part) ? index : last),
    -1
  );
  // A document a tool returned draws once: the tool's card. The
  // streamed `data-chat-artifact` part for the same document is what
  // opened the canvas, not a second card.
  const documentsShownByTools = new Set<string>();
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const output = part.output as { documentId?: unknown; id?: unknown } | undefined;
    const id = output?.documentId ?? output?.id;
    if (typeof id === "string") documentsShownByTools.add(id);
  }

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

  return (
    <MessageRow
      from={isUser ? "user" : "assistant"}
      className="group/chat-message"
    >
      <MessageContent>
        {files.length > 0 ? (
          <AttachmentGroup className="max-w-full">
            {files.map((file, index) => (
              <FileAttachment key={`${message.id}-file-${index}`} file={file} />
            ))}
          </AttachmentGroup>
        ) : null}

        {message.parts.map((part, index) => {
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
                    components={
                      sources.length > 0
                        ? { a: (props) => <CitationAnchor {...props} sources={sources} /> }
                        : undefined
                    }
                  >
                    {streamingText ? part.text : withCitations(part.text, sources.length)}
                  </Streamdown>
                </MessageBubbleContent>
              </MessageBubble>
            );
          }

          if (isReasoningUIPart(part)) {
            if (!part.text) return null;
            const reasoningStreaming =
              isStreamingThis && index === message.parts.length - 1;
            return (
              <Reasoning key={key} isStreaming={reasoningStreaming}>
                <ReasoningTrigger
                  getThinkingMessage={(streaming, duration) =>
                    streaming
                      ? t("message.thinking")
                      : duration === undefined
                        ? t("message.thoughtBriefly")
                        : t("message.thoughtFor", { seconds: duration })
                  }
                />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            const { component: Renderer } = resolveToolRenderer(toolName);
            const approval =
              "approval" in part
                ? (part.approval as { id?: string } | undefined)
                : undefined;
            const props: ToolRendererProps = {
              toolName,
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
            if (part.state === "approval-requested" && !hasToolRenderer(toolName)) {
              return <ApprovalCard key={key} {...props} />;
            }
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
                (artifact.documentId && documentsShownByTools.has(artifact.documentId)) ||
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
        })}

        {sources.length > 0 ? (
          <Sources>
            <SourcesTrigger>
              {t("sources.title", { count: sources.length })}
            </SourcesTrigger>
            <SourcesContent>
              {sources.map((source) => (
                <Source
                  key={source.sourceId}
                  href={source.url}
                  title={source.title ?? source.filename ?? source.url ?? ""}
                />
              ))}
            </SourcesContent>
          </Sources>
        ) : null}

        {isStreamingThis && (isEmptyAssistant || statusLabel) ? (
          <ShimmerText>{statusLabel ?? t("message.thinking")}</ShimmerText>
        ) : null}

        {!readOnly && !isStreamingThis && (hasVisibleText || version) ? (
          <MessageFooter>
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
          </MessageFooter>
        ) : null}
      </MessageContent>
    </MessageRow>
  );
}

/** `[n]` markers render as citations; every other link stays a link. */
function CitationAnchor({
  href,
  children,
  sources,
  ...props
}: React.ComponentProps<"a"> & { sources: SourcePart[] }) {
  const t = useTranslations("chat");
  if (href?.startsWith(CITE_PREFIX)) {
    const index = Number(href.slice(CITE_PREFIX.length));
    const source = sources[index - 1];
    if (source) {
      return (
        <InlineCitation>
          <InlineCitationCard>
            <InlineCitationCardTrigger
              index={index}
              label={t("sources.citation", { index })}
            />
            <InlineCitationCardBody>
              <InlineCitationSource
                title={source.title ?? source.filename}
                url={source.url}
              />
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>
      );
    }
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

function FileAttachment({ file }: { file: FileUIPart }) {
  const t = useTranslations("chat");
  const isImage = file.mediaType.startsWith("image/") && Boolean(file.url);
  if (isImage) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noreferrer"
        className="block max-w-xs"
      >
        <AIImage src={file.url} alt={file.filename ?? t("message.imageAlt")} />
      </a>
    );
  }
  return (
    <Attachment size="sm">
      <AttachmentMedia variant="icon">
        <PaperclipIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.filename ?? t("message.attachment")}</AttachmentTitle>
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
 * The default card for a gated tool awaiting the reader's decision.
 * A tool with its own renderer draws its own; this one shows what is
 * about to run and lets the reader allow or deny it, optionally with a
 * reason the model sees.
 */
/**
 * The default for a call that waits on the reader: a permission card
 * with the tool's input as parameters. Allow, or deny with a reason —
 * the answer rides the approval response and the thread continues on
 * its own.
 */
function ApprovalCard({
  toolName,
  input,
  approvalId,
  isReadonly,
  actions,
}: ToolRendererProps) {
  const t = useTranslations("chat");
  const [decided, setDecided] = useState<"approved" | "denied" | null>(null);
  const parameters =
    input && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>).map(([key, value]) => ({
          id: key,
          label: key,
          value: typeof value === "string" ? value : JSON.stringify(value),
        }))
      : [];
  const canDecide = !isReadonly && Boolean(actions) && Boolean(approvalId);

  function decide(approved: boolean, reason?: string) {
    if (!approvalId || !actions) return;
    setDecided(approved ? "approved" : "denied");
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
      status={decided ?? "pending"}
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
