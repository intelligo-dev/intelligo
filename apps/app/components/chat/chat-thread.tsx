"use client";

/**
 * The thread — one conversation, streaming, with everything a message
 * can do. The page, the side panel and the floating widget all mount
 * this; they differ only in the shell around it and in `variant`.
 *
 * Owns streaming state via the AI SDK's `useChat` (`@ai-sdk/react`),
 * talking to `app/api/chat/route.ts` over a `DefaultChatTransport`.
 * `initialMessages` comes from the server component so reloading a
 * conversation shows its history immediately, with no client-side
 * fetch-on-mount.
 *
 * Per-turn choices — the model, the agent, extra context a shell wants
 * to send — travel in the request body of each send, never in the
 * transport, so switching models mid-conversation rebuilds nothing and
 * loses no draft.
 *
 * A `?query=` search param seeds the first turn: another surface (the
 * dashboard's prompt bar, a marketing CTA) can mint a conversation id
 * and link straight into a started conversation. It is sent once, only
 * into an empty conversation, so a refresh doesn't replay it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useChat } from "@ai-sdk/react";
import type { FileUIPart, UIMessage } from "ai";
import { useSearchParams } from "next/navigation";

import {
  isChatDataPart,
  parseChatError,
  type ChatArtifactData,
  type ChatModelOption,
} from "@intelligo-dev/chat/client";

import { useRouter } from "@/i18n/navigation";
import { chatConfig, type ChatMention } from "@/lib/chat-config";
import type { CanvasRef, ToolRendererActions } from "@/lib/chat-renderers";
import { useChatDraft } from "@/hooks/use-chat-draft";
import { useChatShortcuts } from "@/hooks/use-chat-shortcuts";
import { useChatVersions } from "@/hooks/use-chat-versions";

import { ChatEmpty } from "./chat-empty";
import { ChatErrorStrip } from "./chat-error-strip";
import { ChatInput } from "./chat-input";
import {
  CreditStatusBanner,
  isDeploymentRefusal,
  type ChatBlock,
  type ChatQuotaState,
} from "./credit-status-banner";
import { MessageList } from "./message-list";
import type { MessageVote } from "./message-actions";

/**
 * A refusal that blocks the composer, or nothing. Admission answers 402
 * with the entitlement port's own code (`insufficient_credits`,
 * `allowance_depleted`…), which is what the banner keys its copy on; a
 * feature gate is a block too, and so is a 503 for what only the
 * deployment can fix (`billing_not_configured`, `unknown_model`), which
 * the banner words neutrally. Anything else — a rate limit, a stream
 * failure — is transient and belongs in the error strip.
 */
function refusalFrom(chatError: Error): ChatBlock | null {
  const parsed = parseChatError(chatError);
  if (!parsed) return null;
  if (
    parsed.code !== "QUOTA_EXCEEDED" &&
    parsed.code !== "BILLING_NOT_CONFIGURED" &&
    parsed.code !== "MODEL_UNAVAILABLE" &&
    (parsed.code !== "FEATURE_GATED" ||
      parsed.reasonCode === "model_not_allowed")
  ) {
    return null;
  }
  return { code: parsed.reasonCode ?? parsed.code, message: parsed.error };
}

const MODEL_STORAGE_KEY = "chat:model";

/**
 * When the thread sends the next turn by itself: after the reader
 * answered an approval, or after a card supplied a client-side tool's
 * result. The SDK's tool-calls predicate alone is not enough — a
 * runtime that ends its turn on a server-run tool (a quiz card that
 * waits for a click, a `hasToolCall` stop) also leaves every tool
 * part complete, and re-sending would loop that turn forever. So the
 * tool-calls case counts only when the client put a result in.
 */
function sendWhenClientAnswered(clientAnswered: React.RefObject<boolean>) {
  return (options: { messages: UIMessage[] }) => {
    if (lastAssistantMessageIsCompleteWithApprovalResponses(options))
      return true;
    if (!clientAnswered.current) return false;
    if (!lastAssistantMessageIsCompleteWithToolCalls(options)) return false;
    clientAnswered.current = false;
    return true;
  };
}

export type ChatThreadVariant = "page" | "panel" | "widget";

export interface ChatThreadProps {
  conversationId: string;
  initialMessages: UIMessage[];
  /**
   * Server-rendered credit state. Optional so a deployment that has
   * not wired billing renders the chat unchanged.
   */
  quotaState?: ChatQuotaState | null;
  /**
   * The same estimate for each offered model, by model id. The banner
   * reads the picked model's entry and falls back to `quotaState`.
   */
  quotaStates?: Record<string, ChatQuotaState>;
  /** The reader's earlier votes, by message id. */
  votes?: Record<string, MessageVote>;
  /** Models the composer offers. One or none hides the picker. */
  models?: ChatModelOption[];
  variant?: ChatThreadVariant;
  /** Overrides `chatConfig.agent?.id` for this surface. */
  agentId?: string;
  /** Extra body fields on every turn — page context a panel wants the agent to have. */
  body?: Record<string, unknown>;
  autoFocus?: boolean;
  /** The server wrote a title after the first reply. */
  onTitle?: (title: string) => void;
  /** A document streaming into the canvas: the opening part, each delta, the final one. */
  onArtifact?: (artifact: ChatArtifactData) => void;
  /** A card asked for the canvas. */
  onOpenCanvas?: (ref: CanvasRef) => void;
  onCloseCanvas?: () => void;
  /** Read-only: no composer, no actions. The shared page. */
  readOnly?: boolean;
  /** Filled with the thread's send, for a shell that sends on its behalf (the canvas toolbar). */
  sendRef?: React.RefObject<((text: string) => void) | null>;
  className?: string;
}

export function ChatThread({
  conversationId,
  initialMessages,
  quotaState = null,
  quotaStates,
  votes = {},
  models = [],
  variant = "page",
  agentId,
  body,
  autoFocus = false,
  onTitle,
  onArtifact,
  onOpenCanvas,
  onCloseCanvas,
  readOnly = false,
  sendRef,
  className,
}: ChatThreadProps) {
  const t = useTranslations("chat");
  // Namespace-less: `chatConfig.starters` entries are fully-qualified
  // message keys into the app's whole message tree (see
  // `@/lib/chat-config`'s doc comment), not keys under this item's own
  // "chat" namespace.
  const tAny = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const compact = variant !== "page";

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );

  const resolvedAgentId = agentId ?? chatConfig.agent?.id;

  // The picked model survives a reload and a conversation switch; the
  // server still decides whether the plan allows it.
  const [modelId, setModelIdState] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (models.length === 0) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MODEL_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const allowed = models.find((model) => model.id === stored);
    setModelIdState(allowed?.id ?? models[0]!.id);
  }, [models]);
  const setModelId = useCallback((next: string) => {
    setModelIdState(next);
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, next);
    } catch {
      // Remembering the pick is a convenience.
    }
  }, []);

  const bodyRef = useRef<Record<string, unknown>>({});
  bodyRef.current = {
    id: conversationId,
    ...(resolvedAgentId ? { agentId: resolvedAgentId } : {}),
    ...(modelId ? { modelId } : {}),
    ...body,
  };

  // Set by a card that answers a client-side tool; read by the
  // auto-continue predicate.
  const clientAnswered = useRef(false);
  // A thread that opened empty creates its conversation row on the
  // first reply. The shell's history and this page's header are server
  // rendered, so they learn about it from a refresh — once.
  const startedEmpty = useRef(initialMessages.length === 0);
  // A transient `data-chat-status` — "Searching…", "Writing…" — shown
  // as the shimmer under the reply until the next one or the finish.
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    addToolOutput,
    addToolApprovalResponse,
    status,
    stop,
    error,
    clearError,
  } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen:
      chatConfig.sendAutomaticallyWhen ??
      sendWhenClientAnswered(clientAnswered),
    onFinish: () => {
      if (!startedEmpty.current) return;
      startedEmpty.current = false;
      router.refresh();
    },
    onData: (part) => {
      if (isChatDataPart(part, "chat-title")) {
        onTitle?.(part.data);
        router.refresh();
        return;
      }
      if (isChatDataPart(part, "chat-status")) {
        setStatusLabel(part.data.done ? null : part.data.label);
        return;
      }
      if (isChatDataPart(part, "chat-artifact")) {
        // Every artifact part — the opening one, each delta, the final
        // `ready` — goes to the canvas, which opens on the first and
        // accumulates the rest.
        onArtifact?.(part.data);
      }
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (!isStreaming) setStatusLabel(null);
  }, [isStreaming]);

  const versions = useChatVersions({
    conversationId,
    messages,
    setMessages,
    status,
  });

  const draft = useChatDraft(conversationId);

  /**
   * A refusal the route returned mid-conversation.
   *
   * The server-rendered state is what the page opened with; the
   * balance can run out three turns later, and the reader should not
   * have to reload to be told.
   */
  const [block, setBlock] = useState<ChatBlock | null>(null);
  // Each model has its own worst case, so the estimate that counts is
  // the picked model's.
  const activeQuotaState =
    (modelId ? quotaStates?.[modelId] : undefined) ?? quotaState;
  const blocked = block !== null || activeQuotaState?.allowed === false;

  const starters = useMemo(
    () => (chatConfig.starters ?? []).map((key) => tAny(key)),
    [tAny]
  );

  // In an effect, not in render: `useChat` surfaces the error as
  // state, and setting state while rendering from it is how a render
  // loop starts.
  useEffect(() => {
    if (!error) return;
    const refusal = refusalFrom(error);
    if (refusal) setBlock(refusal);
  }, [error]);

  function friendlyChatError(chatError: Error): string {
    // A non-JSON error response (a proxy's page, a network failure)
    // surfaces as raw text; the generic copy beats showing it.
    return parseChatError(chatError)?.error ?? t("error.generic");
  }

  const send = useCallback(
    (text: string, files: FileUIPart[] = [], mentions: ChatMention[] = []) => {
      const trimmed = text.trim();
      if ((!trimmed && files.length === 0) || isStreaming || blocked) return;
      void sendMessage(
        { text: trimmed, ...(files.length > 0 ? { files } : {}) },
        {
          body: {
            ...bodyRef.current,
            ...(mentions.length > 0
              ? { mentions: mentions.map(({ id, label }) => ({ id, label })) }
              : {}),
          },
        }
      );
      draft.clear();
    },
    [isStreaming, blocked, sendMessage, draft]
  );

  useEffect(() => {
    if (!sendRef) return;
    sendRef.current = (text: string) => send(text);
    return () => {
      sendRef.current = null;
    };
  }, [sendRef, send]);

  const handleRegenerate = useCallback(
    (messageId: string) => {
      if (isStreaming) return;
      versions.beforeRegenerate(messageId);
      void regenerate({ messageId, body: bodyRef.current });
    },
    [isStreaming, versions, regenerate]
  );

  const handleEdit = useCallback(
    (messageId: string, text: string, files: FileUIPart[]) => {
      if (isStreaming) return;
      const at = messages.findIndex((message) => message.id === messageId);
      if (at === -1) return;
      versions.beforeEdit(messageId);
      setMessages(messages.slice(0, at));
      void sendMessage(
        { text, ...(files.length > 0 ? { files } : {}) },
        { body: bodyRef.current }
      );
    },
    [isStreaming, messages, versions, setMessages, sendMessage]
  );

  const editLastUserMessage = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.role !== "user") continue;
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("\n\n");
      draft.setValue(text);
      break;
    }
  }, [messages, draft]);

  useChatShortcuts({
    onNewChat: () => router.push("/chat"),
    onStop: stop,
    isStreaming,
  });

  // Prefill from `?query=`, once, and only into a conversation that has
  // no messages yet.
  const prefillSent = useRef(false);
  useEffect(() => {
    if (prefillSent.current) return;
    const query = searchParams.get("query");
    if (!query || messages.length > 0) return;
    prefillSent.current = true;
    void sendMessage({ text: query }, { body: bodyRef.current });
  }, [searchParams, messages.length, sendMessage]);

  // Rebuilt each render on purpose: `send` closes over `isStreaming`,
  // and nothing downstream is memoized on this object.
  const toolActions: ToolRendererActions = {
    sendMessage: (message) =>
      typeof message === "string"
        ? send(message)
        : send(message.text, message.files),
    addToolResult: (args) => {
      clientAnswered.current = true;
      void addToolOutput(args);
    },
    addToolApprovalResponse: (args) => void addToolApprovalResponse(args),
    openCanvas: (ref) => onOpenCanvas?.(ref),
    closeCanvas: () => onCloseCanvas?.(),
  };

  const composer = readOnly ? null : (
    <ChatInput
      conversationId={conversationId}
      value={draft.value}
      onChange={draft.setValue}
      onSend={send}
      onStop={stop}
      onEditLast={editLastUserMessage}
      isStreaming={isStreaming}
      disabled={blocked}
      disabledPlaceholder={
        isDeploymentRefusal(block?.code ?? activeQuotaState?.code)
          ? t("input.unavailablePlaceholder")
          : t("input.blockedPlaceholder")
      }
      models={models}
      modelId={modelId}
      onModelChange={(next) => {
        // A refusal belongs to the model it was priced against.
        setModelId(next);
        setBlock(null);
        clearError();
      }}
      autoFocus={autoFocus}
      compact={compact}
    />
  );

  const isEmpty = messages.length === 0;

  return (
    <div
      className={["flex min-h-0 flex-1 flex-col", className]
        .filter(Boolean)
        .join(" ")}
    >
      {isEmpty && !readOnly ? (
        <ChatEmpty
          starters={starters}
          onStarterSelect={(text) => send(text)}
          composer={composer}
          compact={compact}
        />
      ) : (
        <MessageList
          conversationId={conversationId}
          messages={messages}
          isStreaming={status === "streaming"}
          statusLabel={statusLabel}
          readOnly={readOnly}
          votes={votes}
          versionOf={(messageId) => {
            const version = versions.versionOf(messageId);
            if (!version) return null;
            return {
              index: version.index,
              count: version.count,
              onIndexChange: (index) =>
                versions.select(version.anchorId, index),
            };
          }}
          onRegenerate={readOnly ? undefined : handleRegenerate}
          onEdit={readOnly ? undefined : handleEdit}
          toolActions={readOnly ? undefined : toolActions}
          compact={compact}
        />
      )}
      <CreditStatusBanner quotaState={activeQuotaState} block={block} />
      {error && !block ? (
        <ChatErrorStrip
          message={friendlyChatError(error)}
          onRetry={
            isStreaming
              ? undefined
              : () => {
                  clearError();
                  void regenerate({ body: bodyRef.current });
                }
          }
          onDismiss={clearError}
        />
      ) : null}
      {!isEmpty && !readOnly ? composer : null}
    </div>
  );
}
