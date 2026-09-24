/**
 * Execution lifecycle — the SaaS boundary around a native AI run.
 *
 *   const run = await executions.begin({ workspaceId, userId, capability });
 *   if (!run.allowed) return refuse(run.reason);
 *   try {
 *     const result = await supportAgent.generate(messages); // native
 *     await run.complete({ usage: result.usage, model: result.model });
 *     return result;
 *   } catch (error) {
 *     await run.fail({ error });
 *     throw error;
 *   }
 *
 * The handle knows nothing about agents, tools, messages, or streams —
 * only actor, workspace, capability, entitlement, status, usage, cost,
 * credits, and audit.
 *
 * Every terminal transition is idempotent: calling complete() twice, or
 * fail() after complete(), leaves the first outcome in place. Streaming
 * routes have several plausible finish paths (usage resolved, client
 * abort, error) and must be able to fire whichever arrives first
 * without racing.
 */

import { db } from "@intelligo-dev/core/db";
import { createLogger } from "@intelligo-dev/core/logger";
import { money, type Money } from "@intelligo-dev/core/money";
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
          price: input.price,
        })
      : { allowed: true };

    const row = db.insert(executions).values({
      id,
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      capability: input.capability,
      requestId,
      status: decision.allowed ? "running" : "refused",
      model: input.model ?? null,
      reservedMicros: decision.estimated?.amount ?? null,
      priceMicros: input.price?.amount ?? null,
      currency: decision.estimated?.currency ?? input.price?.currency ?? null,
      refusalReason: decision.allowed ? null : (decision.reason ?? "refused"),
      startedAt,
      finishedAt: decision.allowed ? null : startedAt,
      durationMs: decision.allowed ? null : 0,
      metadata: input.metadata ?? null,
    });
    try {
      await row;
    } catch (error) {
      // No row means nothing will ever settle or release the hold
      // entitlement just took (a reused `requestId` hits the unique
      // index here), so give it back before failing.
      if (decision.allowed && ports.releaseHold) {
        await ports
          .releaseHold({ workspaceId: input.workspaceId, requestId })
          .catch((releaseError) =>
            log.warn("Hold release failed after insert error", {
              requestId,
              error: errorMessage(releaseError),
            })
          );
      }
      throw error;
    }

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
        estimated: decision.estimated,
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
      estimated: decision.estimated,
      usingTrialCredits,

      async complete(result: CompleteExecutionInput = {}) {
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        const totalTokens =
          result.usage?.totalTokens ?? inputTokens + outputTokens;
        const model = result.model ?? input.model;

        // Claim the right to settle BEFORE spending money, so a second
        // complete() — or a complete() racing a fail() — cannot charge the
        // workspace again.
        // The usage is written with the claim, before any money moves,
        // so a crash after this point leaves enough on the row for
        // reconcile() to finish the job.
        if (
          !(await transition("running", "settling", {
            model: model ?? null,
            inputTokens,
            outputTokens,
            totalTokens,
          }))
        ) {
          return;
        }

        let charged: Money | undefined;
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
              price: input.price,
            });
            charged = settled?.charged;
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
            chargedMicros: charged?.amount ?? null,
            // Only a real charge names the currency; a free capability
            // leaves whatever the hold wrote.
            ...(charged ? { currency: charged.currency } : {}),
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
            charged,
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

  /**
   * Finish an execution the happy path did not.
   *
   * `settling` has two readings — the charge never happened, or it
   * committed and the process died before the final flip — and only
   * the ledger can tell them apart, so the `findSettlement` port is
   * asked first. A charge that exists is confirmed onto the row; one
   * that does not is re-run from the usage the claim recorded. A
   * `running` row older than `abandonRunningAfterMs` (the stream died
   * without reaching complete()/fail()) is failed and its hold
   * released; without that option `running` rows are left alone.
   *
   * Every transition is the same compare-and-swap the lifecycle uses,
   * so a reconcile racing a late complete()/fail() cannot double
   * charge or double release.
   */
  async function reconcile(
    executionId: string,
    options: { abandonRunningAfterMs?: number } = {}
  ): Promise<ReconcileResult> {
    const rows = await db
      .select()
      .from(executions)
      .where(eq(executions.id, executionId))
      .limit(1);
    const row = rows[0];
    if (!row) return { action: "noop", status: "missing" };

    const finish = (fields: Record<string, unknown>) => {
      const finishedAt = new Date();
      return {
        finishedAt,
        durationMs: finishedAt.getTime() - row.startedAt.getTime(),
        ...fields,
      };
    };
    const cas = async (
      from: ExecutionStatus,
      to: ExecutionStatus,
      fields: Record<string, unknown>
    ) => {
      const updated = await db
        .update(executions)
        .set({ status: to, ...fields })
        .where(and(eq(executions.id, executionId), eq(executions.status, from)))
        .returning();
      return updated.length > 0;
    };
    const audit = (how: string, extra: Record<string, unknown> = {}) =>
      recordAuditEvent({
        workspaceId: row.workspaceId,
        actorId: null,
        actorKind: "system",
        action: "execution.reconciled",
        resourceKind: "execution",
        resourceId: executionId,
        metadata: { requestId: row.requestId, how, ...extra },
      });

    if (row.status === "running") {
      const cutoff = options.abandonRunningAfterMs;
      if (
        cutoff === undefined ||
        Date.now() - row.startedAt.getTime() < cutoff
      ) {
        return { action: "noop", status: "running" };
      }
      const moved = await cas(
        "running",
        "failed",
        finish({ errorMessage: "abandoned: no completion within the cutoff" })
      );
      if (!moved) return { action: "noop", status: "running" };
      if (ports.releaseHold) {
        try {
          await ports.releaseHold({
            workspaceId: row.workspaceId,
            requestId: row.requestId,
          });
        } catch (releaseError) {
          log.warn("Hold release failed during reconcile", {
            executionId,
            error: errorMessage(releaseError),
          });
        }
      }
      await audit("abandoned");
      return { action: "abandoned" };
    }

    if (row.status !== "settling") {
      return { action: "noop", status: row.status as ExecutionStatus };
    }

    if (!ports.findSettlement) {
      // Without a way to ask the ledger, re-running settlement could
      // charge a second time. Refuse to guess.
      return {
        action: "noop",
        status: "settling",
        reason:
          "no findSettlement port bound; cannot tell whether the charge exists",
      };
    }

    const existing = await ports.findSettlement({
      workspaceId: row.workspaceId,
      requestId: row.requestId,
    });

    if (existing) {
      const moved = await cas(
        "settling",
        "succeeded",
        finish({
          chargedMicros: existing.charged?.amount ?? null,
          ...(existing.charged ? { currency: existing.charged.currency } : {}),
        })
      );
      if (moved) {
        await audit("confirmed", { charged: existing.charged });
      }
      return { action: "confirmed", charged: existing.charged };
    }

    if (!ports.settleUsage || row.totalTokens === null) {
      return {
        action: "noop",
        status: "settling",
        reason: "no usage recorded on the row to settle from",
      };
    }

    const settled = await ports.settleUsage({
      workspaceId: row.workspaceId,
      userId: row.userId,
      requestId: row.requestId,
      capability: row.capability,
      model: row.model ?? undefined,
      inputTokens: row.inputTokens ?? 0,
      outputTokens: row.outputTokens ?? 0,
      totalTokens: row.totalTokens,
      // Admission's pool choice is not on the row; a settlement port
      // takes the pools in its own order rather than trusting this.
      usingTrialCredits: false,
      metadata: row.metadata ?? undefined,
      price:
        row.priceMicros !== null && row.currency
          ? money(row.priceMicros, row.currency)
          : undefined,
    });
    const charged = settled?.charged;
    await cas(
      "settling",
      "succeeded",
      finish({
        chargedMicros: charged?.amount ?? null,
        ...(charged ? { currency: charged.currency } : {}),
      })
    );
    await audit("settled", { charged });
    return { action: "settled", charged };
  }

  return { begin, reconcile };
}

export type ReconcileResult =
  | {
      action: "noop";
      status: ExecutionStatus | "missing";
      reason?: string;
    }
  /** The ledger already held the charge; the row now says so. */
  | { action: "confirmed"; charged?: Money }
  /** Settlement was re-run from the recorded usage. */
  | { action: "settled"; charged?: Money }
  /** A stale `running` row was failed and its hold released. */
  | { action: "abandoned" };

export type Executions = ReturnType<typeof createExecutions>;
