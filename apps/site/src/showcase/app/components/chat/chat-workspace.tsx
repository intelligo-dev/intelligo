"use client";

/**
 * The page's chat shell: the thread on the left, the canvas on the
 * right when a document is open. Owns the canvas state — which
 * document, its streamed content so far — so the thread and every
 * card can open, feed and close the same panel.
 *
 * From `lg` up the two sit in a resizable split; below, the canvas is
 * a sheet over the thread.
 */

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import type { UIMessage } from "ai";

import type {
  ChatArtifactData,
  ChatModelOption,
} from "@intelligo-dev/chat/client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@showcase/components/ui/resizable";
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

  if (!canvas) return thread;

  const panel = (
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
  );

  if (isMobile) {
    return (
      <>
        {thread}
        <Sheet open onOpenChange={(open) => !open && closeCanvas()}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">{t("canvas.title")}</SheetTitle>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel defaultSize={55} minSize={35}>
        <div className="flex h-full min-h-0 flex-col">{thread}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={45} minSize={25}>
        {panel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
