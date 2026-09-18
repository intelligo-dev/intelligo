"use client";

/*
 * A one-time-code input: a row of slots whose characters roll in as they
 * land, a blinking caret on the focused slot, a shake when the code is
 * rejected and a drawn check when it is accepted. Typing, paste, autofill,
 * arrow keys and the per-slot inputs come from Base UI's OTP Field.
 */

import * as React from "react";
import { OTPField } from "@base-ui/react/otp-field";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";

import { EASE_OUT, SPRING_SWAP } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

export type OTPStatus = "idle" | "error" | "success";

export interface OTPInputLabels {
  /** Visible label above the slots; also the first slot's accessible name. */
  label?: React.ReactNode;
  /** Helper text below the slots while idle. */
  hint?: React.ReactNode;
  /** Message below the slots when the code is rejected. */
  error?: React.ReactNode;
  /** Message below the slots when the code is accepted. */
  success?: React.ReactNode;
  /** Accessible name of the whole field when no visible label is given. */
  field: string;
  /** Accessible name of each slot after the first. */
  slot: (index: number, length: number) => string;
}

const DEFAULT_LABELS: OTPInputLabels = {
  field: "One-time code",
  slot: (index, length) => `Character ${index + 1} of ${length}`,
};

export interface OTPInputProps {
  /** Number of slots. */
  length?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires when every slot is filled (and on a complete paste). */
  onComplete?: (value: string) => void;
  /** Validation feedback: "error" shakes, "success" draws a check. */
  status?: OTPStatus;
  /** Shorthand for `status="error"`. */
  invalid?: boolean;
  /** Obscure the characters as they are typed. */
  mask?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Which characters a slot accepts. */
  validationType?: OTPField.Root.Props["validationType"];
  /** Form field name for the hidden input. */
  name?: string;
  /** Submit the owning form once the code is complete. */
  autoSubmit?: boolean;
  id?: string;
  labels?: Partial<OTPInputLabels>;
  className?: string;
}

export function OTPInput({
  length = 6,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onComplete,
  status: statusProp = "idle",
  invalid = false,
  mask = false,
  disabled = false,
  autoFocus = false,
  validationType = "numeric",
  name,
  autoSubmit,
  id: idProp,
  labels: labelsProp,
  className,
}: OTPInputProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const reduced = useReducedMotion() ?? false;
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const messageId = `${id}-message`;
  const slotsRef = React.useRef<HTMLDivElement>(null);

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  const status: OTPStatus = invalid ? "error" : statusProp;
  const error = status === "error";
  const success = status === "success";

  // The shake replays on every transition into "error".
  React.useEffect(() => {
    if (!error || reduced || !slotsRef.current) return;
    animate(
      slotsRef.current,
      { x: [0, -5, 5, -3, 3, -1, 0] },
      { duration: 0.45, ease: EASE_OUT }
    );
  }, [error, reduced]);

  const message = success ? labels.success : error ? labels.error : labels.hint;

  return (
    <div
      data-slot="otp-input"
      className={cn("inline-flex flex-col gap-2", className)}
    >
      {labels.label ? (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {labels.label}
        </label>
      ) : null}

      <div className="relative inline-flex w-max">
        <motion.div ref={slotsRef}>
          <OTPField.Root
            id={id}
            length={length}
            value={value}
            onValueChange={(next) => {
              if (valueProp === undefined) setUncontrolled(next);
              onValueChange?.(next);
            }}
            onValueComplete={(next) => onComplete?.(next)}
            mask={mask}
            disabled={disabled}
            validationType={validationType}
            name={name}
            autoSubmit={autoSubmit}
            aria-describedby={message ? messageId : undefined}
            className="flex items-center gap-2"
          >
            {Array.from({ length }, (_, index) => {
              const char = value[index] ?? "";
              const focused = focusedIndex === index;
              return (
                <div
                  // A fixed-length slot grid, never reordered.
                  key={index}
                  data-slot="otp-input-slot"
                  data-filled={char !== "" || undefined}
                  data-focused={focused || undefined}
                  className={cn(
                    "relative grid h-12 w-10 place-items-center overflow-hidden rounded-lg border bg-background text-xl font-semibold text-foreground tabular-nums transition-[border-color,box-shadow] duration-200",
                    success
                      ? "border-success/60"
                      : error
                        ? "border-destructive/60"
                        : focused
                          ? "border-ring ring-3 ring-ring/30"
                          : char
                            ? "border-input"
                            : "border-border",
                    disabled && "opacity-50"
                  )}
                >
                  <OTPField.Input
                    aria-label={
                      index === 0
                        ? labels.label
                          ? undefined
                          : labels.field
                        : labels.slot(index, length)
                    }
                    aria-invalid={error || undefined}
                    autoFocus={autoFocus && index === 0}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() =>
                      setFocusedIndex((current) =>
                        current === index ? -1 : current
                      )
                    }
                    // The input owns focus, typing and paste; the glyph and
                    // caret drawn over it are presentational.
                    className="absolute inset-0 size-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-not-allowed"
                  />

                  {focused && !success ? (
                    <motion.span
                      aria-hidden
                      animate={reduced ? undefined : { opacity: [1, 1, 0, 0] }}
                      transition={
                        reduced
                          ? undefined
                          : { duration: 1, repeat: Infinity, ease: "linear" }
                      }
                      className={cn(
                        "pointer-events-none absolute top-1/2 h-6 w-px -translate-y-1/2 bg-foreground",
                        char ? "right-2" : "left-1/2 -translate-x-1/2"
                      )}
                    />
                  ) : null}

                  {/* Each glyph is centred absolutely so enter and exit overlap in place. */}
                  <AnimatePresence initial={false}>
                    {char ? (
                      <motion.span
                        key={char}
                        aria-hidden
                        initial={
                          reduced
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                y: 14,
                                scale: 0.8,
                                filter: "blur(4px)",
                              }
                        }
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          filter: "blur(0px)",
                        }}
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, y: -14, filter: "blur(4px)" }
                        }
                        transition={reduced ? { duration: 0 } : SPRING_SWAP}
                        className="pointer-events-none absolute inset-0 grid place-items-center leading-none"
                      >
                        {mask ? "•" : char}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </OTPField.Root>
        </motion.div>

        <AnimatePresence>
          {success ? (
            <motion.span
              aria-hidden
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 500, damping: 28 }
              }
              className="pointer-events-none absolute top-1/2 -right-7 -translate-y-1/2 text-success"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <motion.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: 0.35, ease: EASE_OUT, delay: 0.1 }
                  }
                />
              </svg>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {message ? (
        <p
          id={messageId}
          aria-live="polite"
          className={cn(
            "text-sm",
            success
              ? "text-success"
              : error
                ? "text-destructive"
                : "text-muted-foreground"
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
