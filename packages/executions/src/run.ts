/**
 * The shapes the execution lifecycle takes and returns: what `begin()`
 * is given, the run handle it hands back, and what `reconcile()` did.
 */

import type { Money } from "@intelligo-dev/core/money";

import type { Workload } from "./pricing";

/**
 * Row lifecycle. `settling` is non-terminal and deliberate: it marks
 * the window where usage is being charged, so a second complete() or a
 * racing fail() cannot re-enter it, and a settlement that dies mid-way
 * leaves a state the stale sweep reports rather than a row that claims
 * success for usage nobody recorded.
 */
export type ExecutionStatus =
  "running" | "settling" | "succeeded" | "failed" | "refused";

export type BeginExecutionInput = {
  workspaceId: string;
  userId?: string | null;
  /** Product-defined verb, e.g. "support.reply". */
  capability: string;
  /** Supply to reuse an existing correlation id; generated otherwise. */
  requestId?: string;
  /** Model the caller intends to use — informs the entitlement hold. */
  model?: string;
  /**
   * The prompt's size and the model calls the run may make, so the hold
   * covers this run rather than a one-call default.
   */
  workload?: Workload;
  /**
   * Hold the workload's first step only, and grow the hold one step at a
   * time with `run.extend()` before each next one, so a run is admitted
   * on what its first call can cost rather than on every step it may
   * take. Needs the `extendHold` port; without it the whole workload is
   * held at admission, as when this is unset.
   */
  stepwise?: boolean;
  /**
   * The work already ran and its tokens are spent — another model a tool
   * called mid-turn. Admission is skipped, since refusing cannot unspend
   * them, nothing is held, and `complete()` charges the usage.
   */
  alreadySpent?: boolean;
  /**
   * A fixed price for this unit of work — a report, an export — instead
   * of its tokens' price: entitlement holds exactly this, completion
   * charges it, failure releases it.
   */
  price?: Money;
  metadata?: Record<string, unknown>;
};

export type CompleteExecutionInput = {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    /** Of `inputTokens`, those read from the provider's prompt cache. */
    cacheReadTokens?: number;
    /** Of `inputTokens`, those written to the provider's prompt cache. */
    cacheWriteTokens?: number;
  };
  model?: string;
  metadata?: Record<string, unknown>;
};

export type ExecutionRun = {
  id: string;
  requestId: string;
  /** False when entitlement refused; complete()/fail() are then no-ops. */
  allowed: boolean;
  /** Stable refusal code from the entitlement port; set when allowed is false. */
  code?: string;
  /** Set when allowed is false. */
  reason?: string;
  /** The hold entitlement took for this run. */
  estimated?: Money;
  /** True once admission or any extension was covered only by the trial grant. */
  usingTrialCredits: boolean;
  complete(input?: CompleteExecutionInput): Promise<void>;
  fail(input: { error: unknown }): Promise<void>;
  /**
   * The usage spent so far, written onto the row while it is still
   * `running` — after each model call of a multi-step run. Nothing is
   * charged; it is what `reconcile()` settles if the process dies
   * before `complete()`. Optional, so a hand-built handle need not
   * implement it.
   */
  progress?(input: { usage: CompleteExecutionInput["usage"] }): Promise<void>;
  /**
   * Grow the hold before work admission did not cover — the next step
   * of a run begun `stepwise`. `workload` is that work alone. A refusal
   * holds nothing more, and the caller stops before the work; the run
   * itself stays open and settles what it spent. Allowed without
   * holding anything when no `extendHold` port is bound, when the run
   * has a fixed price, or was begun as already spent. Optional, so a
   * hand-built handle need not implement it.
   */
  extend?(input: { workload?: Workload }): Promise<HoldExtension>;
};

/** What `run.extend()` decided. */
export type HoldExtension = {
  allowed: boolean;
  /** Stable refusal code from the port; set when allowed is false. */
  code?: string;
  /** Set when allowed is false. */
  reason?: string;
  /** What this extension added to the hold. */
  estimated?: Money;
  /** True when only the trial grant covers this extension. */
  usingTrialCredits?: boolean;
};

export type ReconcileResult =
  | {
      action: "noop";
      status: ExecutionStatus | "missing";
      reason?: string;
    }
  /** The ledger already held the charge; the row now says so. */
  | { action: "confirmed"; charged?: Money }
  /**
   * Settlement was re-run from the recorded usage — a stuck `settling`
   * row, or an abandoned `running` row that recorded its progress.
   */
  | { action: "settled"; charged?: Money }
  /** A stale `running` row was failed and its hold released. */
  | { action: "abandoned" };
