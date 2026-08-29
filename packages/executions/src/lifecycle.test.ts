/**
 * Execution lifecycle tests.
 *
 * Pins the contract the rest of Phase 2 builds on: entitlement gates
 * admission, terminal transitions happen exactly once, settlement
 * failures leave the row unsettled rather than claiming success, and
 * every transition emits an audit event.
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
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: { insert: mocks.insert, update: mocks.update },
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
  capability: "support.recommendation",
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
      capability: "support.recommendation",
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
      capability: "support.recommendation",
      requestId: "req-1",
      model: "google/gemini-2.5-flash",
    });
  });

  it("refuses the run and records it when entitlement says no", async () => {
    const executions = createExecutions({
      checkEntitlement: vi
        .fn()
        .mockResolvedValue({ allowed: false, reason: "Out of credits" }),
      settleUsage: vi.fn(),
    });

    const run = await executions.begin(beginInput);

    expect(run.allowed).toBe(false);
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
        estimatedMnt: 1500,
        usingTrialCredits: true,
      }),
    });

    const run = await executions.begin(beginInput);

    expect(run.estimatedMnt).toBe(1500);
    expect(run.usingTrialCredits).toBe(true);
    expect(insertedRow().reservedMnt).toBe(1500);
  });
});

describe("complete", () => {
  it("settles usage, marks the row succeeded, and audits", async () => {
    const settleUsage = vi.fn().mockResolvedValue({ chargedMnt: 320 });
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
        capability: "support.recommendation",
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
      chargedMnt: 320,
      model: "anthropic/claude-sonnet-4-6",
    });
    expect(auditActions()).toEqual(["execution.completed"]);
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
    // The money, not just the audit trail. settleUsage used to run
    // before the compare-and-swap, so a second call deducted again and
    // only then discovered it had lost the race.
    const settleUsage = vi.fn().mockResolvedValue({ chargedMnt: 100 });
    const executions = createExecutions({ settleUsage });
    const run = await executions.begin(beginInput);

    await run.complete({ usage: { totalTokens: 10 } });
    mocks.updateReturning.mockResolvedValue([]); // lost the claim
    await run.complete({ usage: { totalTokens: 10 } });

    expect(settleUsage).toHaveBeenCalledTimes(1);
  });

  it("does not charge when fail() already claimed the execution", async () => {
    const settleUsage = vi.fn().mockResolvedValue({ chargedMnt: 100 });
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
      return { chargedMnt: 1 };
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
      settleUsage: vi.fn().mockResolvedValue({ chargedMnt: 50 }),
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
