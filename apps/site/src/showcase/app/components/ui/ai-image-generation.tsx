"use client";

/*
 * An image the agent is making: the frame is reserved up front, a dither
 * field breathes over it while it is queued and generating, and the media
 * sharpens into place as it refines and completes — no layout shift at any
 * step.
 */

import * as React from "react";
import { CheckIcon, CircleAlertIcon, RotateCcwIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_PRESS,
} from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

export type ImageGenerationStatus =
  | "queued"
  | "generating"
  | "refining"
  | "complete"
  | "error";

export interface ImageGenerationProps {
  /** The completed media. Pass an img, Next Image, canvas, video, or custom preview. */
  children?: React.ReactNode;
  status?: ImageGenerationStatus;
  /** Accessible description. Defaults to a description derived from prompt. */
  label?: string;
  prompt?: string;
  resolution?: string;
  /** CSS aspect ratio reserved before generated media is available. */
  aspectRatio?: React.CSSProperties["aspectRatio"];
  size?: "compact" | "fluid";
  /** Lets the active dither cluster follow fine-pointer movement. */
  interactive?: boolean;
  /** Overrides the status line for the current status only. */
  statusText?: string;
  /** The status line per status. */
  statusLabels?: Partial<Record<ImageGenerationStatus, string>>;
  showStatus?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  mediaClassName?: string;
  statusClassName?: string;
}

const STATUS_TEXT: Record<ImageGenerationStatus, string> = {
  queued: "Waiting to generate",
  generating: "Generating image",
  refining: "Refining details",
  complete: "Image ready",
  error: "Generation failed",
};

const MEDIA_STATE: Record<
  ImageGenerationStatus,
  { filter: string; opacity: number; scale: number }
> = {
  queued: { filter: "blur(4px) saturate(0.75)", opacity: 0, scale: 1.02 },
  generating: { filter: "blur(3px) saturate(0.85)", opacity: 0, scale: 1.015 },
  refining: { filter: "blur(1.5px) saturate(0.95)", opacity: 0.62, scale: 1.005 },
  complete: { filter: "blur(0px) saturate(1)", opacity: 1, scale: 1 },
  error: { filter: "blur(2px) saturate(0.5)", opacity: 0.28, scale: 1 },
};

const OVERLAY_OPACITY: Record<ImageGenerationStatus, number> = {
  queued: 1,
  generating: 1,
  refining: 0.48,
  complete: 0,
  error: 0,
};

const DOT_GAP = 10;
const TWO_PI = Math.PI * 2;

/** The 10px resolution chip; the type scale has no step this small. */
const TINY_TEXT: React.CSSProperties = { fontSize: "0.625rem" };

/*
 * True only on devices with a real hover (mouse / trackpad). Touch devices
 * fire phantom `:hover` on tap that sticks until tap-elsewhere — hover-only
 * effects are gated behind this.
 */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHover(onChange: () => void) {
  const query = window.matchMedia(HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useHoverCapable() {
  return React.useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false
  );
}

function DitherMark({
  status,
  reduced,
}: {
  status: ImageGenerationStatus;
  reduced: boolean;
}) {
  if (status === "complete") {
    return <CheckIcon aria-hidden="true" className="size-3.5" />;
  }

  if (status === "error") {
    return <CircleAlertIcon aria-hidden="true" className="size-3.5" />;
  }

  return (
    <motion.span
      data-slot="image-generation-mark"
      aria-hidden="true"
      animate={reduced ? undefined : { rotate: 360 }}
      transition={{
        duration: 2.4,
        ease: EASE_IN_OUT,
        repeat: Number.POSITIVE_INFINITY,
      }}
      className="grid size-3.5 grid-cols-2 place-items-center gap-0.5"
    >
      <span className="size-1 rounded-xs bg-current" />
      <span className="size-1 rounded-xs bg-current opacity-55" />
      <span className="size-1 rounded-xs bg-current opacity-55" />
      <span className="size-1 rounded-xs bg-current" />
    </motion.span>
  );
}

function DitherField({
  interactive,
  reduced,
  status,
}: {
  interactive: boolean;
  reduced: boolean;
  status: ImageGenerationStatus;
}) {
  const canHover = useHoverCapable();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dotColor = "currentColor";
    const pointer = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      inside: false,
    };
    const pointerEnabled = interactive && canHover && !reduced;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || canvas.clientWidth || 208;
      height = rect.height || canvas.clientHeight || 208;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      dotColor = window.getComputedStyle(canvas).color;
      pointer.x = width / 2;
      pointer.y = height / 2;
      pointer.targetX = pointer.x;
      pointer.targetY = pointer.y;
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      if (!pointer.inside) {
        pointer.targetX =
          width / 2 + (reduced ? 0 : Math.sin(time / 1700) * width * 0.12);
        pointer.targetY =
          height / 2 + (reduced ? 0 : Math.cos(time / 2100) * height * 0.1);
      }

      const follow = reduced ? 1 : pointer.inside ? 0.16 : 0.045;
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;

      const radius = Math.min(width, height) * 0.38;
      const columns = Math.ceil(width / DOT_GAP) + 1;
      const rows = Math.ceil(height / DOT_GAP) + 1;
      const offsetX = (width - (columns - 1) * DOT_GAP) / 2;
      const offsetY = (height - (rows - 1) * DOT_GAP) / 2;

      context.fillStyle = dotColor;

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const anchorX = offsetX + column * DOT_GAP;
          const anchorY = offsetY + row * DOT_GAP;
          const deltaX = anchorX - pointer.x;
          const deltaY = anchorY - pointer.y;
          const distance = Math.hypot(deltaX, deltaY);
          const proximity = Math.max(0, 1 - distance / radius);
          const influence = proximity * proximity * (3 - 2 * proximity);
          const displacement = influence * influence * 9;
          const directionX = distance > 0 ? deltaX / distance : 0;
          const directionY = distance > 0 ? deltaY / distance : 0;
          const x = anchorX + directionX * displacement;
          const y = anchorY + directionY * displacement;
          const dotRadius = 0.65 + influence * 0.85;

          context.globalAlpha = 0.17 + influence * 0.72;
          context.beginPath();
          context.arc(x, y, dotRadius, 0, TWO_PI);
          context.fill();
        }
      }

      context.globalAlpha = 1;
      // Reduced motion draws the field once and leaves it still.
      if (!reduced) frame = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerEnabled) return;
      const rect = canvas.getBoundingClientRect();
      pointer.inside = true;
      pointer.targetX = event.clientX - rect.left;
      pointer.targetY = event.clientY - rect.top;
    };

    const handlePointerLeave = () => {
      pointer.inside = false;
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);

    resize();
    resizeObserver?.observe(canvas);
    canvas.addEventListener("pointermove", handlePointerMove, { passive: true });
    canvas.addEventListener("pointerleave", handlePointerLeave);
    draw(0);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [canHover, interactive, reduced]);

  return (
    <motion.div
      data-slot="image-generation-dither"
      aria-hidden="true"
      initial={false}
      animate={{ opacity: OVERLAY_OPACITY[status] }}
      transition={{ duration: reduced ? 0 : 0.4, ease: EASE_OUT }}
      className="absolute inset-0 overflow-hidden bg-muted"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full text-foreground"
      />
    </motion.div>
  );
}

function ImageGeneration({
  children,
  status = "generating",
  label,
  prompt,
  resolution = "1024 × 1024",
  aspectRatio = "1 / 1",
  size = "compact",
  interactive = true,
  statusText,
  statusLabels,
  showStatus = true,
  onRetry,
  retryLabel = "Try again",
  className,
  mediaClassName,
  statusClassName,
}: ImageGenerationProps) {
  const reduced = useReducedMotion() ?? false;
  const active =
    status === "queued" || status === "generating" || status === "refining";
  const mediaState = MEDIA_STATE[status];
  const resolvedStatusText =
    statusText ?? statusLabels?.[status] ?? STATUS_TEXT[status];
  const resolvedLabel =
    label ?? (prompt ? `${resolvedStatusText}: ${prompt}` : resolvedStatusText);

  return (
    <div
      data-slot="image-generation"
      data-state={status}
      aria-busy={active}
      className={cn("w-full", className)}
    >
      <div className={cn("w-full", size === "compact" && "mx-auto max-w-52")}>
        <div
          data-slot="image-generation-frame"
          role="img"
          aria-label={resolvedLabel}
          style={{ aspectRatio }}
          className="relative isolate w-full overflow-hidden rounded-xl bg-muted"
        >
          <motion.div
            data-slot="image-generation-media"
            aria-hidden={children ? undefined : true}
            initial={false}
            animate={
              reduced
                ? { opacity: mediaState.opacity }
                : {
                    filter: mediaState.filter,
                    opacity: mediaState.opacity,
                    scale: mediaState.scale,
                  }
            }
            transition={
              reduced ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }
            }
            className={cn(
              "absolute inset-0 [&>*]:size-full [&>*]:object-cover [&_img]:size-full [&_img]:object-cover",
              mediaClassName
            )}
          >
            {children}
          </motion.div>

          <AnimatePresence initial={false}>
            {active ? (
              <motion.div
                key="dither-field"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.25, ease: EASE_OUT }}
                className="absolute inset-0"
              >
                <DitherField
                  interactive={interactive}
                  reduced={reduced}
                  status={status}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {resolution ? (
            <span
              data-slot="image-generation-resolution"
              className="absolute top-2 right-2 z-10 rounded-full bg-background/75 px-2 py-0.5 font-mono tabular-nums text-muted-foreground"
              style={TINY_TEXT}
            >
              {resolution}
            </span>
          ) : null}
        </div>

        {showStatus || prompt ? (
          <div className="mt-3 text-left">
            {showStatus ? (
              <div
                data-slot="image-generation-status"
                aria-live="polite"
                className={cn(
                  "flex min-h-5 items-center gap-2 text-sm font-medium text-foreground",
                  status === "error" && "text-destructive",
                  statusClassName
                )}
              >
                <DitherMark status={status} reduced={reduced} />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={resolvedStatusText}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, y: -4 }}
                    transition={{
                      duration: reduced ? 0 : 0.15,
                      ease: EASE_OUT,
                    }}
                  >
                    {resolvedStatusText}
                  </motion.span>
                </AnimatePresence>
              </div>
            ) : null}
            {prompt ? (
              <p
                data-slot="image-generation-prompt"
                className="mt-0.5 truncate text-xs text-muted-foreground"
              >
                “{prompt}”
              </p>
            ) : null}
          </div>
        ) : null}

        {status === "error" && onRetry ? (
          <Button
            data-slot="image-generation-retry"
            type="button"
            variant="ghost"
            onClick={onRetry}
            className="mt-3 min-h-10 px-3 text-foreground"
            render={
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.96 }}
                transition={SPRING_PRESS}
              />
            }
          >
            <RotateCcwIcon aria-hidden="true" className="size-4" />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export { ImageGeneration };
