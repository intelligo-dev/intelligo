"use client";

/*
 * A decision surface the agent
 * hands to the user: approve / reject / request changes, or a short run
 * of questions (single choice, multiple choice, freeform) answered one
 * step at a time and submitted together. import * as React from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleHelpIcon,
  MessageSquareTextIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  Disclosure,
  EASE_OUT,
  SPRING_SWAP,
  SwapText,
} from "@ui/components/ui/ai-motion";
import { Button } from "@ui/components/ui/button";
import { Checkbox } from "@ui/components/ui/checkbox";
import { Input } from "@ui/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@ui/components/ui/radio-group";
import { Spinner } from "@ui/components/ui/spinner";
import { cn } from "@ui/lib/utils";

export type ApprovalCardStatus =
  | "pending"
  | "submitting"
  | "approved"
  | "rejected"
  | "changes-requested"
  | "answered";

export interface ApprovalCardOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ApprovalCardQuestion {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  options?: ApprovalCardOption[];
  /** Several options may be chosen; otherwise a single choice. */
  multiple?: boolean;
  /** Move on shortly after a single choice (default true). */
  autoAdvance?: boolean;
  /** Offer a freeform answer beside (or instead of) the options. */
  allowCustom?: boolean;
  customPlaceholder?: string;
}

export interface ApprovalCardAnswer {
  selected: string[];
  custom?: string;
}

export type ApprovalCardAnswers = Record<string, ApprovalCardAnswer>;

export interface ApprovalCardProps
  extends Omit<React.ComponentProps<"div">, "title" | "onSubmit"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  questions?: ApprovalCardQuestion[];
  status?: ApprovalCardStatus;
  answers?: ApprovalCardAnswers;
  defaultAnswers?: ApprovalCardAnswers;
  onAnswersChange?: (answers: ApprovalCardAnswers) => void;
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  onSubmit?: (answers: ApprovalCardAnswers) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestChanges?: () => void;
  onDismiss?: () => void;
  /** What to show once the decision has landed; defaults to the status label. */
  result?: React.ReactNode;
  approveLabel?: React.ReactNode;
  rejectLabel?: React.ReactNode;
  requestChangesLabel?: React.ReactNode;
  submitLabel?: React.ReactNode;
  dismissLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  customPlaceholder?: string;
  /** Screen-reader progress, e.g. "Question 2 of 5". */
  progressLabel?: (current: number, total: number) => string;
  statusLabels?: Partial<Record<ApprovalCardStatus, string>>;
}

const EMPTY_ANSWER: ApprovalCardAnswer = { selected: [], custom: "" };

const DEFAULT_STATUS_LABELS: Record<ApprovalCardStatus, string> = {
  pending: "Input required",
  submitting: "Submitting",
  approved: "Approved",
  rejected: "Rejected",
  "changes-requested": "Changes requested",
  answered: "Response submitted",
};

const ICON_CLASS: Partial<Record<ApprovalCardStatus, string>> = {
  approved: "text-success",
  answered: "text-success",
  rejected: "text-destructive",
  "changes-requested": "text-warning",
};

const BADGE_CLASS: Record<ApprovalCardStatus, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  "changes-requested": "border-warning/30 bg-warning/10 text-warning",
  submitting: "border-info/30 bg-info/10 text-info",
  approved: "border-success/30 bg-success/10 text-success",
  answered: "border-success/30 bg-success/10 text-success",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

function isAnswered(answer: ApprovalCardAnswer) {
  return answer.selected.length > 0 || Boolean(answer.custom?.trim());
}

/* ----------------------------------------------------------------------------
 * One question's controls: checkboxes, radios and/or a freeform input.
 * ------------------------------------------------------------------------- */

const OPTION_ROW =
  "flex min-h-9 items-center gap-3 rounded-lg px-1.5 py-1 text-sm text-foreground select-none";

function OptionRow({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      data-slot="approval-card-option"
      className={cn(
        OPTION_ROW,
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      )}
    >
      {children}
    </label>
  );
}

function QuestionOptions({
  question,
  answer,
  disabled,
  customPlaceholder,
  onChange,
  onSingleSelect,
}: {
  question: ApprovalCardQuestion;
  answer: ApprovalCardAnswer;
  disabled: boolean;
  customPlaceholder: string;
  onChange: (answer: ApprovalCardAnswer) => void;
  onSingleSelect?: () => void;
}) {
  const custom = answer.custom ?? "";

  return (
    <div data-slot="approval-card-question" className="mt-3">
      {question.options?.length ? (
        question.multiple ? (
          <div className="grid gap-0.5">
            {question.options.map((option) => {
              const rowDisabled = disabled || Boolean(option.disabled);
              return (
                <OptionRow key={option.value} disabled={rowDisabled}>
                  <Checkbox
                    checked={answer.selected.includes(option.value)}
                    disabled={rowDisabled}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...answer,
                        selected: checked
                          ? [...answer.selected, option.value]
                          : answer.selected.filter(
                              (value) => value !== option.value
                            ),
                      })
                    }
                  />
                  <span>{option.label}</span>
                </OptionRow>
              );
            })}
          </div>
        ) : (
          <RadioGroup
            value={answer.selected[0] ?? ""}
            onValueChange={(value) => {
              onChange({ selected: [String(value)], custom: "" });
              onSingleSelect?.();
            }}
            className="gap-0.5"
          >
            {question.options.map((option) => {
              const rowDisabled = disabled || Boolean(option.disabled);
              return (
                <OptionRow key={option.value} disabled={rowDisabled}>
                  <RadioGroupItem value={option.value} disabled={rowDisabled} />
                  <span>{option.label}</span>
                </OptionRow>
              );
            })}
          </RadioGroup>
        )
      ) : null}

      {question.allowCustom ? (
        <Input
          data-slot="approval-card-custom"
          value={custom}
          disabled={disabled}
          placeholder={question.customPlaceholder ?? customPlaceholder}
          aria-label={question.customPlaceholder ?? customPlaceholder}
          onChange={(event) =>
            onChange({
              selected: question.multiple ? answer.selected : [],
              custom: event.target.value,
            })
          }
          className={cn(
            "h-10 rounded-xl border-0 bg-background/70 px-3 text-sm focus-visible:bg-background",
            question.options?.length && "mt-1.5"
          )}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Progress dots: one per question, the current one full size.
 * ------------------------------------------------------------------------- */

function ProgressDots({
  current,
  ids,
  label,
}: {
  current: number;
  ids: string[];
  label: string;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <span data-slot="approval-card-progress" className="flex gap-1.5">
      <span className="sr-only">{label}</span>
      {ids.map((id, index) => (
        <motion.span
          key={id}
          aria-hidden="true"
          initial={false}
          animate={{
            scale: reduced ? 1 : index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          transition={reduced ? { duration: 0 } : SPRING_SWAP}
          className="size-1.5 rounded-full bg-foreground"
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * ApprovalCard: the card.
 * ------------------------------------------------------------------------- */

function ApprovalCard({
  title = "Approval required",
  description,
  children,
  questions = [],
  status = "pending",
  answers,
  defaultAnswers = {},
  onAnswersChange,
  step,
  defaultStep = 0,
  onStepChange,
  onSubmit,
  onApprove,
  onReject,
  onRequestChanges,
  onDismiss,
  result,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  requestChangesLabel = "Request changes",
  submitLabel = "Submit response",
  dismissLabel = "Dismiss",
  previousLabel = "Previous question",
  nextLabel = "Next question",
  customPlaceholder = "Add another response…",
  progressLabel = (current, total) => `Question ${current} of ${total}`,
  statusLabels,
  className,
  ...props
}: ApprovalCardProps) {
  const reduced = useReducedMotion() ?? false;
  const [internalAnswers, setInternalAnswers] =
    React.useState<ApprovalCardAnswers>(defaultAnswers);
  const [internalStep, setInternalStep] = React.useState(defaultStep);
  const autoAdvanceTimer = React.useRef<number | undefined>(undefined);
  const currentAnswers = answers ?? internalAnswers;
  const currentStep = Math.min(
    Math.max(0, step ?? internalStep),
    Math.max(0, questions.length - 1)
  );
  const question = questions[currentStep];
  const questionMode = questions.length > 0;
  const lastStep = currentStep === questions.length - 1;
  const pending = status === "pending";
  const busy = status === "submitting";
  const interactive = pending || busy;
  const currentAnswer = question
    ? (currentAnswers[question.id] ?? EMPTY_ANSWER)
    : EMPTY_ANSWER;
  const displayTitle = question?.title ?? title;
  const titleKey = question?.id ?? String(status);
  const statusLabel = statusLabels?.[status] ?? DEFAULT_STATUS_LABELS[status];

  const clearAutoAdvance = React.useCallback(() => {
    if (autoAdvanceTimer.current === undefined) return;
    window.clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = undefined;
  }, []);

  React.useEffect(() => clearAutoAdvance, [clearAutoAdvance]);

  const setAnswers = React.useCallback(
    (next: ApprovalCardAnswers) => {
      if (answers === undefined) setInternalAnswers(next);
      onAnswersChange?.(next);
    },
    [answers, onAnswersChange]
  );

  const setStep = (next: number) => {
    clearAutoAdvance();
    if (step === undefined) setInternalStep(next);
    onStepChange?.(next);
  };

  const updateCurrentAnswer = (next: ApprovalCardAnswer) => {
    if (!question) return;
    setAnswers({ ...currentAnswers, [question.id]: next });
  };

  const continueQuestion = () => {
    if (currentStep < questions.length - 1) {
      setStep(currentStep + 1);
      return;
    }
    onSubmit?.(currentAnswers);
  };

  // A single choice reads as "done"; the next question follows after a beat
  // so the selection is seen before the panel slides.
  const queueAutoAdvance = () => {
    if (
      !question ||
      question.multiple ||
      question.autoAdvance === false ||
      currentStep >= questions.length - 1 ||
      busy
    ) {
      return;
    }

    clearAutoAdvance();
    autoAdvanceTimer.current = window.setTimeout(() => {
      setStep(currentStep + 1);
    }, 240);
  };

  return (
    <div
      data-slot="approval-card"
      data-state={status}
      aria-busy={busy || undefined}
      className={cn(
        "w-full overflow-hidden rounded-2xl bg-muted p-4 text-sm",
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <span
          data-slot="approval-card-icon"
          aria-hidden="true"
          className={cn(
            "grid size-5 shrink-0 place-items-center text-muted-foreground",
            ICON_CLASS[status]
          )}
        >
          {busy ? (
            <Spinner className="size-4" />
          ) : interactive ? (
            questionMode ? (
              <CircleHelpIcon className="size-4" />
            ) : (
              <MessageSquareTextIcon className="size-4" />
            )
          ) : status === "rejected" ? (
            <XIcon className="size-4" />
          ) : (
            <CheckIcon className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div data-slot="approval-card-header" className="flex min-w-0 items-start gap-3">
            <h3
              data-slot="approval-card-title"
              className="min-w-0 flex-1 text-base leading-5 font-medium text-foreground"
            >
              <SwapText value={titleKey}>{displayTitle}</SwapText>
            </h3>
            {questionMode && interactive ? (
              <span
                data-slot="approval-card-counter"
                className="shrink-0 text-xs text-muted-foreground/65 tabular-nums"
              >
                {currentStep + 1}/{questions.length}
              </span>
            ) : (
              <span
                data-slot="approval-card-status"
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  BADGE_CLASS[status]
                )}
              >
                {statusLabel}
              </span>
            )}
            {onDismiss ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={dismissLabel}
                onClick={onDismiss}
                className="-mt-0.5 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}
          </div>

          <Disclosure open={interactive}>
            {questionMode && question ? (
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={question.id}
                  data-slot="approval-card-step"
                  initial={reduced ? { opacity: 1 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
                >
                  {question.description ? (
                    <p className="mt-1 leading-5 text-muted-foreground">
                      {question.description}
                    </p>
                  ) : null}
                  <QuestionOptions
                    question={question}
                    answer={currentAnswer}
                    disabled={busy}
                    customPlaceholder={customPlaceholder}
                    onChange={updateCurrentAnswer}
                    onSingleSelect={queueAutoAdvance}
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div data-slot="approval-card-content">
                {description ? (
                  <p className="mt-1 leading-5 text-muted-foreground">
                    {description}
                  </p>
                ) : null}
                {children ? <div className="mt-3">{children}</div> : null}
              </div>
            )}

            {questionMode ? (
              <div
                data-slot="approval-card-actions"
                className="mt-4 flex items-center gap-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={previousLabel}
                  disabled={busy || currentStep === 0}
                  onClick={() => setStep(currentStep - 1)}
                  className="rounded-full"
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <ProgressDots
                  current={currentStep}
                  ids={questions.map((item) => item.id)}
                  label={progressLabel(currentStep + 1, questions.length)}
                />
                <Button
                  type="button"
                  size={lastStep ? "sm" : "icon"}
                  aria-label={lastStep ? undefined : nextLabel}
                  disabled={busy || !isAnswered(currentAnswer)}
                  aria-busy={busy || undefined}
                  onClick={continueQuestion}
                  className="ml-auto rounded-full"
                >
                  {busy ? (
                    <Spinner className="size-4" />
                  ) : lastStep ? (
                    <>
                      {submitLabel}
                      <ArrowRightIcon className="size-3.5" />
                    </>
                  ) : (
                    <ArrowRightIcon className="size-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div
                data-slot="approval-card-actions"
                className="mt-4 flex flex-wrap items-center gap-2"
              >
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={onApprove}
                  className="rounded-full"
                >
                  {approveLabel}
                </Button>
                {onRequestChanges ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={onRequestChanges}
                    className="rounded-full"
                  >
                    {requestChangesLabel}
                  </Button>
                ) : null}
                {onReject ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="rounded-full text-muted-foreground hover:text-destructive"
                  >
                    {rejectLabel}
                  </Button>
                ) : null}
              </div>
            )}
          </Disclosure>

          {!interactive ? (
            <p
              data-slot="approval-card-result"
              className="mt-1 text-sm text-muted-foreground"
            >
              {result ?? statusLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { ApprovalCard };
