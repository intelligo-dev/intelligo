/**
 * Execution lifecycle — the SaaS boundary around a native AI run.
 *
 *   const run = await executions.begin({ workspaceId, userId, capability });
 *   if (!run.allowed) return refuse(run.reason);
 *   try {
 *     const result = await careerAgent.generate(messages); // native
 *     await run.complete({ usage: result.usage, model: result.model });
 *     return result;
 *   } catch (error) {
 *     await run.fail({ error });
 *     throw error;
 *   }
 *
 * The handle knows nothing about agents, tools, messages, or streams —
 * only actor, workspace, capability, entitlement, status, usage, cost,
 * credits, and audit (ADR-0003).
 *
 * Every terminal transition is idempotent: calling complete() twice, or
 * fail() after complete(), leaves the first outcome in place. Streaming
 * routes have several plausible finish paths (usage resolved, client
 * abort, error) and must be able to fire whichever arrives first
 * without racing.
 */

import { db } from "@intelligo-dev/core/db";
import { createLogger } from "@intelligo-dev/core/logger";
import { recordAuditEvent } from "@intelligo-dev/audit";
import { and, eq } from "drizzle-orm";

import { executions } from "./db/schema";
import type { ExecutionPorts } from "./ports";

const log = createLogger("Executions");

/**
 * Row lifecycle. `settling` is non-terminal and deliberate: it marks
 * the window where usage is being charged, so a second complete() or a
 * racing fail() cannot re-enter it, and a settlement that dies mid-way
 * leaves a state the stale sweep reports rather than a row that claims
 * success for usage nobody recorded.
 */
export type ExecutionStatus =
  | "running"
  | "settling"
  | "succeeded"
  | "failed"
  | "refused";

export type BeginExecutionInput = {
  workspaceId: string;
  userId?: string | null;
  /** Product-defined verb, e.g. "support.recommendation". */
  capability: string;
  /** Supply to reuse an existing correlation id; generated otherwise. */
  requestId?: string;
  /** Model the caller intends to use — informs the entitlement hold. */
  model?: string;
  metadata?: Record<string, unknown>;
};

export type CompleteExecutionInput = {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
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
  estimatedMnt?: number;
  usingTrialCredits: boolean;
  complete(input?: CompleteExecutionInput): Promise<void>;
  fail(input: { error: unknown }): Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createExecutions(ports: ExecutionPorts = {}) {
  async function begin(input: BeginExecutionInput): Promise<ExecutionRun> {
    const requestId = input.requestId ?? crypto.randomUUID();
    const id = crypto.randomUUID();
    const startedAt = new Date();

    const decision = ports.checkEntitlement
      ? await ports.checkEntitlement({
          workspaceId: input.workspaceId,
          userId: input.userId,
          capability: input.capability,
          requestId,
          model: input.model,
        })
      : { allowed: true };

    await db.insert(executions).values({
      id,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      capability: input.capability,
      requestId,
      status: decision.allowed ? "running" : "refused",
      model: input.model ?? null,
      reservedMnt: decision.estimatedMnt ?? null,
      refusalReason: decision.allowed ? null : (decision.reason ?? "refused"),
      startedAt,
      finishedAt: decision.allowed ? null : startedAt,
      durationMs: decision.allowed ? null : 0,
      metadata: input.metadata ?? null,
    });

    const usingTrialCredits = decision.usingTrialCredits ?? false;

    if (!decision.allowed) {
      await recordAuditEvent({
        workspaceId: input.workspaceId,
        actorId: input.userId ?? null,
        action: "execution.refused",
        resourceKind: "execution",
        resourceId: id,
        outcome: "failed",
        metadata: {
          capability: input.capability,
          requestId,
          code: decision.code,
          reason: decision.reason,
        },
      });

      return {
        id,
        requestId,
        allowed: false,
        code: decision.code,
        reason: decision.reason,
        estimatedMnt: decision.estimatedMnt,
        usingTrialCredits,
        async complete() {},
        async fail() {},
      };
    }

    /**
     * Compare-and-swap the row's status. Returns false when another
     * path already moved it, so the caller can skip the side effects
     * that belong to the transition it lost.
     */
    async function transition(
      from: ExecutionStatus,
      to: ExecutionStatus,
      fields: Record<string, unknown> = {}
    ): Promise<boolean> {
      const updated = await db
        .update(executions)
        .set({ status: to, ...fields })
        .where(and(eq(executions.id, id), eq(executions.status, from)))
        .returning();
      return updated.length > 0;
    }

    /** Terminal transition: stamps the finish time and duration. */
    function finishFields(fields: Record<string, unknown>) {
      const finishedAt = new Date();
      return {
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        ...fields,
      };
    }

    return {
      id,
      requestId,
      allowed: true,
      estimatedMnt: decision.estimatedMnt,
      usingTrialCredits,

      async complete(result: CompleteExecutionInput = {}) {
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        const totalTokens =
          result.usage?.totalTokens ?? inputTokens + outputTokens;
        const model = result.model ?? input.model;

        // Claim the right to settle BEFORE spending money. The CAS used
        // to happen after settleUsage, so a second complete() — or a
        // complete() racing a fail() — charged the workspace again and
        // then quietly discovered it had lost the race. Status and
        // audit were idempotent; the deduction was not.
        if (!(await transition("running", "settling"))) return;

        let chargedMnt: number | undefined;
        if (ports.settleUsage) {
          try {
            const settled = await ports.settleUsage({
              workspaceId: input.workspaceId,
              userId: input.userId,
              requestId,
              capability: input.capability,
              model,
              inputTokens,
              outputTokens,
              totalTokens,
              usingTrialCredits,
              metadata: result.metadata ?? input.metadata,
            });
            chargedMnt = settled?.chargedMnt;
          } catch (error) {
            // Usage is money: never silently drop it. The row stays
            // `settling` — a non-terminal state the stale sweep reports
            // — so the execution is visibly unsettled rather than
            // recorded as a successful free turn.
            log.error("Usage settlement failed", {
              executionId: id,
              requestId,
              workspaceId: input.workspaceId,
              error: errorMessage(error),
            });
            await recordAuditEvent({
              workspaceId: input.workspaceId,
              actorId: input.userId ?? null,
              action: "execution.settlement_failed",
              resourceKind: "execution",
              resourceId: id,
              outcome: "failed",
              metadata: {
                requestId,
                capability: input.capability,
                error: errorMessage(error),
              },
            });
            throw error;
          }
        }

        await transition(
          "settling",
          "succeeded",
          finishFields({
            model: model ?? null,
            inputTokens,
            outputTokens,
            totalTokens,
            chargedMnt: chargedMnt ?? null,
          })
        );

        await recordAuditEvent({
          workspaceId: input.workspaceId,
          actorId: input.userId ?? null,
          action: "execution.completed",
          resourceKind: "execution",
          resourceId: id,
          metadata: {
            requestId,
            capability: input.capability,
            model,
            totalTokens,
            chargedMnt,
          },
        });
      },

      async fail({ error }: { error: unknown }) {
        // Only from `running`. Once complete() has claimed the row for
        // settlement, a late abort must not release a hold that is
        // about to be charged.
        const transitioned = await transition(
          "running",
          "failed",
          finishFields({ errorMessage: errorMessage(error).slice(0, 1000) })
        );
        if (!transitioned) return;

        if (ports.releaseHold) {
          try {
            await ports.releaseHold({
              workspaceId: input.workspaceId,
              requestId,
            });
          } catch (releaseError) {
            // Non-fatal: an unreleased hold expires on its own.
            log.warn("Hold release failed", {
              executionId: id,
              requestId,
              error: errorMessage(releaseError),
            });
          }
        }

        await recordAuditEvent({
          workspaceId: input.workspaceId,
          actorId: input.userId ?? null,
          action: "execution.failed",
          resourceKind: "execution",
          resourceId: id,
          outcome: "failed",
          metadata: {
            requestId,
            capability: input.capability,
            error: errorMessage(error),
          },
        });
      },
    };
  }

  return { begin };
}

export type Executions = ReturnType<typeof createExecutions>;
