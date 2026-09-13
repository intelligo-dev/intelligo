"use client";

/**
 * The page's chat shell: the thread on the left, the canvas on the
 * right when a document is open. Owns the canvas state — which
 * document, its streamed content so far — so the thread and every
 * card can open, feed and close the same panel.
 *
 * From `lg` up the two sit side by side; below, the canvas is a sheet
 * over the thread. The thread keeps one place in the tree either way:
 * a layout that moved or remounted it would drop the conversation in
 * flight (a resizable panel group did exactly that when its panel
 * count changed).
 */

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import type { UIMessage } from "ai";

import type {
  ChatArtifactData,
  ChatModelOption,
} from "@intelligo-dev/chat/client";

import { Sheet, SheetContent, SheetTitle } from "@showcase/components/ui/sheet";
import { useIsMobile } from "@showcase/hooks/use-mobile";
import type { CanvasRef } from "@showcase/lib/chat-renderers";

import { ChatCanvas, type CanvasState } from "./chat-canvas";
import { ChatThread } from "./chat-thread";
import type { ChatQuotaState } from "./credit-status-banner";
import type { MessageVote } from "./message-actions";

interface ChatWorkspaceProps {
  conversationId: string;
  initialMessages: UIMessage[];
  quotaState?: ChatQuotaState | null;
  votes?: Record<string, MessageVote>;
  models?: ChatModelOption[];
}

export function ChatWorkspace({
  conversationId,
  initialMessages,
  quotaState = null,
  votes = {},
  models = [],
}: ChatWorkspaceProps) {
  const t = useTranslations("chat");
  const isMobile = useIsMobile();
  const [canvas, setCanvas] = useState<CanvasState | null>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);

  const openCanvas = useCallback((ref: CanvasRef) => {
    setCanvas({
      ...ref,
      content: ref.content ?? "",
      status: ref.status ?? "ready",
    });
  }, []);

  const closeCanvas = useCallback(() => setCanvas(null), []);

  /** The opening part opens the panel; deltas grow it; the last part settles it. */
  const onArtifact = useCallback((artifact: ChatArtifactData) => {
    setCanvas((current) => {
      const same = current?.id === artifact.id;
      if (artifact.delta !== undefined) {
        if (!same) return current;
        return { ...current!, content: current!.content + artifact.delta };
      }
      if (artifact.status === "streaming") {
        if (same) return current;
        return {
          id: artifact.id,
          kind: artifact.kind,
          title: artifact.title,
          ...(artifact.documentId ? { documentId: artifact.documentId } : {}),
          content: "",
          status: "streaming",
        };
      }
      if (!same) return current;
      return {
        ...current!,
        title: artifact.title,
        ...(artifact.documentId ? { documentId: artifact.documentId } : {}),
        ...(artifact.content !== undefined ? { content: artifact.content } : {}),
        status: artifact.status,
      };
    });
  }, []);

  const thread = (
    <ChatThread
      conversationId={conversationId}
      initialMessages={initialMessages}
      quotaState={quotaState}
      votes={votes}
      models={models}
      variant="page"
      onArtifact={onArtifact}
      onOpenCanvas={openCanvas}
      onCloseCanvas={closeCanvas}
      sendRef={sendRef}
    />
  );

  const panel = canvas ? (
    <ChatCanvas
      canvas={canvas}
      onClose={closeCanvas}
      onSendMessage={(text) => sendRef.current?.(text)}
      onSaved={(documentId, content) =>
        setCanvas((current) =>
          current ? { ...current, documentId, content } : current
        )
      }
    />
  ) : null;

  if (isMobile) {
    return (
      <>
        {thread}
        <Sheet open={canvas !== null} onOpenChange={(open) => !open && closeCanvas()}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">{t("canvas.title")}</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{thread}</div>
      {canvas ? (
        <aside className="flex w-2/5 min-w-80 shrink-0 flex-col border-l">
          {panel}
        </aside>
      ) : null}
    </div>
  );
}
