/**
 * Runs a native agent call inside an execution: opens it, settles usage from
 * whatever shape the provider reported, and releases the credit hold when the
 * run throws. Mastra's types pass through untouched; `@mastra/core` is an
 * optional peer and is never imported — the agent is typed structurally.
 */

import type { Executions } from "@intelligo-dev/executions";

/**
 * The slice of a Mastra result the boundary reads. Deliberately
 * permissive: providers disagree about which usage fields they set,
 * and about whether they nest usage under `usage` at all.
 */
export type NativeUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Older/other providers' spellings. */
  promptTokens?: number;
  completionTokens?: number;
};

export type NativeResult = {
  usage?: NativeUsage;
  /**
   * Usage across every step of a multi-step run. Mastra sets both, and
   * `usage` holds only the LAST step — so a tool loop that made five
   * model calls reports the fifth. Anything that reads `usage` alone
   * under-bills every agentic run it settles.
   */
  totalUsage?: NativeUsage;
  model?: string | { modelId?: string };
  [key: string]: unknown;
};

/**
 * Normalize the usage shapes providers actually emit.
 *
 * Prefers `totalUsage` — the whole run — and falls back to `usage` for
 * results that report one call and nothing else. Returns zeros when
 * nothing was reported; the caller decides whether an unreported turn
 * is free or charged a floor, because that is billing policy, not a
 * property of the run.
 */
export function readUsage(result: NativeResult | undefined) {
  const usage = result?.totalUsage ?? result?.usage ?? {};
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

/** Providers report the model as a string or as an object with modelId. */
export function readModel(
  result: NativeResult | undefined
): string | undefined {
  const model = result?.model;
  if (typeof model === "string") return model;
  if (model && typeof model === "object") return model.modelId;
  return undefined;
}

export type RunWithExecutionOptions = {
  executions: Executions;
  workspaceId: string;
  userId?: string | null;
  /** Product-defined verb, e.g. "support.reply". */
  capability: string;
  /** Model the run intends to use — sizes the credit hold. */
  model?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export class ExecutionRefusedError extends Error {
  readonly code = "EXECUTION_REFUSED";
  constructor(
    message: string,
    readonly executionId: string,
    /** The entitlement port's stable refusal code, when it gave one. */
    readonly reasonCode?: string
  ) {
    super(message);
    this.name = "ExecutionRefusedError";
  }
}

/**
 * Run a native call inside an execution.
 *
 * ```ts
 * const result = await runWithExecution(
 *   { executions, workspaceId, userId, capability: "support.reply" },
 *   () => supportAgent.generate(messages) // native Mastra, untouched
 * );
 * ```
 *
 * Throws {@link ExecutionRefusedError} when entitlement refuses, so a
 * refusal is impossible to mistake for a successful empty result. Any
 * error from the run itself is recorded and rethrown unchanged — the
 * caller still sees Mastra's own error.
 */
export async function runWithExecution<T extends NativeResult>(
  options: RunWithExecutionOptions,
  run: () => Promise<T>
): Promise<T> {
  const execution = await options.executions.begin({
    workspaceId: options.workspaceId,
    userId: options.userId,
    capability: options.capability,
    requestId: options.requestId,
    model: options.model,
    metadata: options.metadata,
  });

  if (!execution.allowed) {
    throw new ExecutionRefusedError(
      execution.reason ?? "Execution refused",
      execution.id,
      execution.code
    );
  }

  let result: T;
  try {
    result = await run();
  } catch (error) {
    await execution.fail({ error });
    throw error;
  }

  await execution.complete({
    usage: readUsage(result),
    model: readModel(result) ?? options.model,
    metadata: options.metadata,
  });

  return result;
}

/**
 * Streaming variant. A stream's usage is only known once it finishes,
 * so the caller gets the native stream immediately plus a `settle`
 * callback to invoke when it ends — and an `abort` for the paths where
 * it does not (client disconnect, timeout).
 *
 * Both are idempotent through the execution handle, so a route may
 * wire all of onFinish/onError/onAbort without racing itself.
 */
export async function streamWithExecution<T extends NativeResult>(
  options: RunWithExecutionOptions,
  start: () => Promise<T>
): Promise<{
  stream: T;
  settle: (result?: NativeResult) => Promise<void>;
  abort: (error?: unknown) => Promise<void>;
  executionId: string;
  requestId: string;
}> {
  const execution = await options.executions.begin({
    workspaceId: options.workspaceId,
    userId: options.userId,
    capability: options.capability,
    requestId: options.requestId,
    model: options.model,
    metadata: options.metadata,
  });

  if (!execution.allowed) {
    throw new ExecutionRefusedError(
      execution.reason ?? "Execution refused",
      execution.id
    );
  }

  let stream: T;
  try {
    stream = await start();
  } catch (error) {
    await execution.fail({ error });
    throw error;
  }

  return {
    stream,
    executionId: execution.id,
    requestId: execution.requestId,
    settle: (result) =>
      execution.complete({
        usage: readUsage(result ?? stream),
        model: readModel(result ?? stream) ?? options.model,
        metadata: options.metadata,
      }),
    abort: (error) =>
      execution.fail({ error: error ?? new Error("Stream aborted") }),
  };
}
