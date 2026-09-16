"use client";

/**
 * The page's chat shell: the thread on the left, the canvas on the
 * right when a document is open. Owns the canvas state — which
 * document, its streamed content so far — so the thread and every
 * card can open, feed and close the same panel, and a card can show
 * the lines being written (`ArtifactStreamProvider`).
 *
 * From `md` up the two sit side by side: the reader drags the edge (or
 * uses the arrow keys on it) to resize the canvas, or expands it to
 * fill the page. Below, the canvas is a sheet over the thread. The
 * thread keeps one place in the tree either way: a layout that moved
 * or remounted it would drop the conversation in flight (a resizable
 * panel group did exactly that when its panel count changed), so the
 * edge is a plain handle on the canvas's width and an expanded canvas
 * hides the thread rather than replacing it.
 */

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import type { UIMessage } from "ai";

import type {
  ChatArtifactData,
  ChatModelOption,
} from "@intelligo-dev/chat/client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CanvasRef } from "@/lib/chat-renderers";
import { cn } from "@/lib/utils";

import { ArtifactStreamProvider } from "./artifact-card";
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

/** The canvas's share of the row, in percent. */
const WIDTH = { initial: 45, min: 30, max: 70, step: 2 };

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
  const [width, setWidth] = useState(WIDTH.initial);
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);

  const openCanvas = useCallback((ref: CanvasRef) => {
    setCanvas({
      ...ref,
      content: ref.content ?? "",
      status: ref.status ?? "ready",
    });
  }, []);

  const closeCanvas = useCallback(() => {
    setCanvas(null);
    setExpanded(false);
  }, []);

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
        ...(artifact.content !== undefined
          ? { content: artifact.content }
          : {}),
        status: artifact.status,
      };
    });
  }, []);

  function startResize(event: PointerEvent<HTMLDivElement>) {
    const row = rowRef.current;
    if (!row || event.button !== 0) return;
    event.preventDefault();
    const bounds = row.getBoundingClientRect();
    const move = (moveEvent: globalThis.PointerEvent) => {
      const share = ((bounds.right - moveEvent.clientX) / bounds.width) * 100;
      setWidth(Math.min(WIDTH.max, Math.max(WIDTH.min, share)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function resizeWithKeys(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowLeft"
        ? WIDTH.step
        : event.key === "ArrowRight"
          ? -WIDTH.step
          : 0;
    if (!delta) return;
    event.preventDefault();
    setWidth((current) =>
      Math.min(WIDTH.max, Math.max(WIDTH.min, current + delta))
    );
  }

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
      expanded={expanded}
      onToggleExpand={
        isMobile ? undefined : () => setExpanded((value) => !value)
      }
    />
  ) : null;

  const stream =
    canvas?.status === "streaming"
      ? { id: canvas.id, content: canvas.content }
      : null;

  // One tree for every width: the thread is always the first child of
  // the same row, so crossing the breakpoint (a rotation, a resized
  // window) reconciles it in place and keeps the messages in flight.
  // Only what holds the canvas changes — a sheet over the thread on a
  // phone, a column beside it otherwise.
  return (
    <ArtifactStreamProvider value={stream}>
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            canvas && expanded && !isMobile && "hidden"
          )}
        >
          {thread}
        </div>
        {isMobile ? (
          <Sheet
            open={canvas !== null}
            onOpenChange={(open) => !open && closeCanvas()}
          >
            <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
              <SheetTitle className="sr-only">{t("canvas.title")}</SheetTitle>
              {panel}
            </SheetContent>
          </Sheet>
        ) : canvas ? (
          <aside
            className={cn(
              "relative flex shrink-0 flex-col bg-background",
              expanded ? "flex-1" : "min-w-80 border-l"
            )}
            style={expanded ? undefined : { width: `${width}%` }}
          >
            {expanded ? null : (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("canvas.resize")}
                aria-valuemin={WIDTH.min}
                aria-valuemax={WIDTH.max}
                aria-valuenow={Math.round(width)}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeWithKeys}
                className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:transition-colors hover:after:bg-ring/60 focus-visible:after:bg-ring"
              />
            )}
            {panel}
          </aside>
        ) : null}
      </div>
    </ArtifactStreamProvider>
  );
}
