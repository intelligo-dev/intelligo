/**
 * Execution lifecycle tests: entitlement gates admission, terminal
 * transitions happen exactly once, settlement failures leave the row
 * unsettled rather than claiming success, and every transition emits
 * an audit event.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insert: vi.fn(),
  updateReturning: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  recordAuditEvent: vi.fn(),
  /** Rows `reconcile()` reads back. */
  selectRows: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.selectRows }),
      }),
    }),
  },
}));

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@intelligo-dev/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("./db/schema", () => ({
  executions: { id: "id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
}));

import { money } from "@intelligo-dev/core/money";

import { createExecutions } from "./lifecycle";

/** The row inserted by begin(). */
function insertedRow() {
  return mocks.insertValues.mock.calls[0]![0]! as Record<string, unknown>;
}

/** The set() payload of the Nth update. */
function updatedFields(n = 0) {
  return mocks.updateSet.mock.calls[n]![0]! as Record<string, unknown>;
}

function auditActions() {
  return mocks.recordAuditEvent.mock.calls.map(
    (c) => (c[0] as { action: string }).action
  );
}

const beginInput = {
  workspaceId: "ws-1",
  userId: "u-1",
  capability: "support.reply",
  model: "google/gemini-2.5-flash",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
  // Default: every CAS wins. Tests that model a lost race override this.
  mocks.updateReturning.mockResolvedValue([{ id: "e-1" }]);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
});

describe("begin", () => {
  it("records a running execution and allows the run when no ports are bound", async () => {
    const executions = createExecutions();

    const run = await executions.begin(beginInput);

    expect(run.allowed).toBe(true);
    expect(run.requestId).toBeTruthy();
    expect(insertedRow()).toMatchObject({
      workspaceId: "ws-1",
      userId: "u-1",
      capability: "support.reply",
      status: "running",
    });
  });

  it("reuses a supplied requestId as the correlation key", async () => {
    const executions = createExecutions();

    const run = await executions.begin({ ...beginInput, requestId: "req-42" });

    expect(run.requestId).toBe("req-42");
    expect(insertedRow().requestId).toBe("req-42");
  });

  it("passes the capability and model to the entitlement port", async () => {
    const checkEntitlement = vi.fn().mockResolvedValue({ allowed: true });
    const executions = createExecutions({ checkEntitlement });

    await executions.begin({ ...beginInput, requestId: "req-1" });

    expect(checkEntitlement).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "u-1",
      capability: "support.reply",
      requestId: "req-1",
      model: "google/gemini-2.5-flash",
    });
  });

  it("refuses the run and records it when entitlement says no", async () => {
    const executions = createExecutions({
      checkEntitlement: vi.fn().mockResolvedValue({
        allowed: false,
        code: "allowance_depleted",
        reason: "Out of credits",
      }),
      settleUsage: vi.fn(),
    });

    const run = await executions.begin(beginInput);

    expect(run.allowed).toBe(false);
    expect(run.code).toBe("allowance_depleted");
    expect(run.reason).toBe("Out of credits");
    expect(insertedRow()).toMatchObject({
      status: "refused",
      refusalReason: "Out of credits",
      durationMs: 0,
    });
    expect(auditActions()).toEqual(["execution.refused"]);
  });

  it("makes complete() and fail() no-ops on a refused run", async () => {
    const settleUsage = vi.fn();
    const executions = createExecutions({
      checkEntitlement: vi.fn().mockResolvedValue({ allowed: false }),
      settleUsage,
    });

    const run = await executions.begin(beginInput);
    await run.complete({ usage: { totalTokens: 100 } });
    await run.fail({ error: new Error("boom") });

    expect(settleUsage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("carries the entitlement hold onto the row", async () => {
    const executions = createExecutions({
      checkEntitlement: vi.fn().mockResolvedValue({
        allowed: true,
        estimated: money(1500, "MNT"),
        usingTrialCredits: true,
      }),
    });

    const run = await executions.begin(beginInput);

    expect(run.estimated?.amount).toBe(1500);
    expect(run.usingTrialCredits).toBe(true);
    expect(insertedRow().reservedMicros).toBe(1500);
  });

  it("carries a typed hold onto the row, with the currency it is in", async () => {
    const executions = createExecutions({
      checkEntitlement: vi.fn().mockResolvedValue({
        allowed: true,
        estimated: money(4_820, "USD"),
      }),
    });

    const run = await executions.begin(beginInput);

    expect(run.estimated).toEqual(money(4_820, "USD"));
    expect(insertedRow()).toMatchObject({
      reservedMicros: 4_820,
      currency: "USD",
    });
  });
});

describe("complete", () => {
  it("settles usage, marks the row succeeded, and audits", async () => {
    const settleUsage = vi
      .fn()
      .mockResolvedValue({ charged: money(320, "MNT") });
    const executions = createExecutions({ settleUsage });

    const run = await executions.begin({ ...beginInput, requestId: "req-7" });
    await run.complete({
      usage: { inputTokens: 100, outputTokens: 250 },
      model: "anthropic/claude-sonnet-4-6",
    });

    expect(settleUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        requestId: "req-7",
        capability: "support.reply",
        model: "anthropic/claude-sonnet-4-6",
        inputTokens: 100,
        outputTokens: 250,
        totalTokens: 350,
      })
    );
    // Update 0 is the claim (running → settling); update 1 finalizes.
    expect(updatedFields(1)).toMatchObject({
      status: "succeeded",
      totalTokens: 350,
      chargedMicros: 320,
      model: "anthropic/claude-sonnet-4-6",
    });
    expect(auditActions()).toEqual(["execution.completed"]);
  });

  it("records a typed charge in micros, with the currency it is in", async () => {
    // What a USD deployment charges for one turn: a fraction of a cent,
    // which whole units could only round to nothing or to $1.
    const settleUsage = vi
      .fn()
      .mockResolvedValue({ charged: money(4_792, "USD") });
    const executions = createExecutions({ settleUsage });

    const run = await executions.begin(beginInput);
    await run.complete({ usage: { inputTokens: 1_100, outputTokens: 347 } });

    expect(updatedFields(1)).toMatchObject({
      status: "succeeded",
      chargedMicros: 4_792,
      currency: "USD",
    });
  });

  it("derives totalTokens from the split when the provider omits it", async () => {
    const settleUsage = vi.fn().mockResolvedValue(undefined);
    const executions = createExecutions({ settleUsage });

    const run = await executions.begin(beginInput);
    await run.complete({ usage: { inputTokens: 7, outputTokens: 11 } });

    expect(settleUsage.mock.calls[0]![0]!.totalTokens).toBe(18);
  });

  it("leaves the execution unsettled and rethrows when settlement fails", async () => {
    const executions = createExecutions({
      settleUsage: vi.fn().mockRejectedValue(new Error("db down")),
    });

    const run = await executions.begin(beginInput);

    await expect(run.complete({ usage: { totalTokens: 10 } })).rejects.toThrow(
      "db down"
    );
    // The row is left in `settling` — non-terminal, so the stale sweep
    // reports it — and is never marked succeeded for unrecorded usage.
    const statuses = mocks.updateSet.mock.calls.map(
      (c) => (c[0] as { status?: string }).status
    );
    expect(statuses).toEqual(["settling"]);
    expect(auditActions()).toEqual(["execution.settlement_failed"]);
  });

  it("is idempotent: a second complete() does not re-audit", async () => {
    const executions = createExecutions();
    const run = await executions.begin(beginInput);

    await run.complete();
    mocks.updateReturning.mockResolvedValue([]); // row no longer `running`
    await run.complete();

    expect(auditActions()).toEqual(["execution.completed"]);
  });

  it("does not charge twice when complete() is called twice", async () => {
    // The money, not just the audit trail: settlement runs only after
    // the compare-and-swap, so a second call must not deduct again.
    const settleUsage = vi
      .fn()
      .mockResolvedValue({ charged: money(100, "MNT") });
    const executions = createExecutions({ settleUsage });
    const run = await executions.begin(beginInput);

    await run.complete({ usage: { totalTokens: 10 } });
    mocks.updateReturning.mockResolvedValue([]); // lost the claim
    await run.complete({ usage: { totalTokens: 10 } });

    expect(settleUsage).toHaveBeenCalledTimes(1);
  });

  it("does not charge when fail() already claimed the execution", async () => {
    const settleUsage = vi
      .fn()
      .mockResolvedValue({ charged: money(100, "MNT") });
    const executions = createExecutions({ settleUsage });
    const run = await executions.begin(beginInput);

    // A client abort wins the race: the row leaves `running` first.
    await run.fail({ error: new Error("client disconnected") });
    mocks.updateReturning.mockResolvedValue([]);
    await run.complete({ usage: { totalTokens: 10 } });

    expect(settleUsage).not.toHaveBeenCalled();
  });

  it("claims the row before spending money", async () => {
    const order: string[] = [];
    mocks.updateSet.mockImplementation((fields: Record<string, unknown>) => {
      order.push(`status:${fields.status}`);
      return { where: mocks.updateWhere };
    });
    const settleUsage = vi.fn().mockImplementation(async () => {
      order.push("settle");
      return { charged: money(1, "MNT") };
    });
    const executions = createExecutions({ settleUsage });
    const run = await executions.begin(beginInput);

    await run.complete({ usage: { totalTokens: 10 } });

    expect(order).toEqual(["status:settling", "settle", "status:succeeded"]);
  });
});

describe("fail", () => {
  it("marks the row failed, releases the hold, and audits", async () => {
    const releaseHold = vi.fn().mockResolvedValue(undefined);
    const executions = createExecutions({ releaseHold });

    const run = await executions.begin({ ...beginInput, requestId: "req-9" });
    await run.fail({ error: new Error("model timeout") });

    expect(updatedFields()).toMatchObject({
      status: "failed",
      errorMessage: "model timeout",
    });
    expect(releaseHold).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      requestId: "req-9",
    });
    expect(auditActions()).toEqual(["execution.failed"]);
  });

  it("survives a hold-release failure — the hold expires on its own", async () => {
    const executions = createExecutions({
      releaseHold: vi.fn().mockRejectedValue(new Error("release failed")),
    });

    const run = await executions.begin(beginInput);

    await expect(
      run.fail({ error: new Error("boom") })
    ).resolves.toBeUndefined();
    expect(auditActions()).toEqual(["execution.failed"]);
  });

  it("does not overwrite a completed execution", async () => {
    const executions = createExecutions();
    const run = await executions.begin(beginInput);

    await run.complete();
    mocks.updateReturning.mockResolvedValue([]); // already terminal
    await run.fail({ error: new Error("late abort") });

    expect(auditActions()).toEqual(["execution.completed"]);
  });

  it("does not release a hold that settlement already claimed", async () => {
    const releaseHold = vi.fn().mockResolvedValue(undefined);
    const executions = createExecutions({
      settleUsage: vi.fn().mockResolvedValue({ charged: money(50, "MNT") }),
      releaseHold,
    });
    const run = await executions.begin(beginInput);

    await run.complete({ usage: { totalTokens: 10 } });
    mocks.updateReturning.mockResolvedValue([]); // no longer `running`
    await run.fail({ error: new Error("late abort") });

    expect(releaseHold).not.toHaveBeenCalled();
  });

  it("truncates very long error messages", async () => {
    const executions = createExecutions();
    const run = await executions.begin(beginInput);

    await run.fail({ error: new Error("x".repeat(5000)) });

    expect((updatedFields().errorMessage as string).length).toBe(1000);
  });
});

describe("reconcile", () => {
  const settlingRow = (over: Record<string, unknown> = {}) => ({
    id: "e-1",
    workspaceId: "ws-1",
    userId: "u-1",
    capability: "support.reply",
    requestId: "req-1",
    status: "settling",
    model: "google/gemini-2.5-flash",
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    startedAt: new Date(Date.now() - 60_000),
    metadata: null,
    ...over,
  });

  it("confirms a settling row whose charge the ledger already holds — without charging again", async () => {
    mocks.selectRows.mockResolvedValue([settlingRow()]);
    const settleUsage = vi.fn();
    const executions = createExecutions({
      settleUsage,
      findSettlement: vi.fn().mockResolvedValue({ charged: money(42, "MNT") }),
    });

    const r = await executions.reconcile("e-1");

    expect(r).toEqual({ action: "confirmed", charged: money(42, "MNT") });
    expect(settleUsage).not.toHaveBeenCalled();
    expect(updatedFields(0)).toMatchObject({
      status: "succeeded",
      chargedMicros: 42,
    });
    expect(auditActions()).toEqual(["execution.reconciled"]);
  });

  it("re-runs settlement from the recorded usage when the ledger has no charge", async () => {
    mocks.selectRows.mockResolvedValue([settlingRow()]);
    const settleUsage = vi.fn().mockResolvedValue({ charged: money(7, "MNT") });
    const executions = createExecutions({
      settleUsage,
      findSettlement: vi.fn().mockResolvedValue(null),
    });

    const r = await executions.reconcile("e-1");

    expect(r).toEqual({ action: "settled", charged: money(7, "MNT") });
    expect(settleUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      })
    );
    expect(updatedFields(0)).toMatchObject({
      status: "succeeded",
      chargedMicros: 7,
    });
  });

  it("refuses to guess when no findSettlement port is bound", async () => {
    mocks.selectRows.mockResolvedValue([settlingRow()]);
    const settleUsage = vi.fn();
    const executions = createExecutions({ settleUsage });

    const r = await executions.reconcile("e-1");

    expect(r.action).toBe("noop");
    expect(settleUsage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("abandons a running row past the cutoff and releases its hold", async () => {
    mocks.selectRows.mockResolvedValue([
      settlingRow({
        status: "running",
        startedAt: new Date(Date.now() - 3_600_000),
      }),
    ]);
    const releaseHold = vi.fn();
    const executions = createExecutions({ releaseHold });

    const r = await executions.reconcile("e-1", {
      abandonRunningAfterMs: 600_000,
    });

    expect(r).toEqual({ action: "abandoned" });
    expect(updatedFields(0)).toMatchObject({ status: "failed" });
    expect(releaseHold).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      requestId: "req-1",
    });
  });

  it("leaves a running row alone without a cutoff, and terminal rows always", async () => {
    mocks.selectRows.mockResolvedValue([settlingRow({ status: "running" })]);
    const executions = createExecutions({ releaseHold: vi.fn() });
    expect(await executions.reconcile("e-1")).toEqual({
      action: "noop",
      status: "running",
    });

    mocks.selectRows.mockResolvedValue([settlingRow({ status: "succeeded" })]);
    expect(await executions.reconcile("e-1")).toEqual({
      action: "noop",
      status: "succeeded",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports a missing execution", async () => {
    mocks.selectRows.mockResolvedValue([]);
    const executions = createExecutions();
    expect(await executions.reconcile("nope")).toEqual({
      action: "noop",
      status: "missing",
    });
  });
});
