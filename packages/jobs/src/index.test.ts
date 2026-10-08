/**
 * Job queue tests — the drain contract.
 *
 * The interesting cases are the ones that decide whether work is lost:
 * an unknown kind must go back to pending without burning an attempt,
 * a failure must retry until maxAttempts and then stop, and a handler
 * throwing must not abort the rest of the batch.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  claimed: vi.fn(),
  started: vi.fn(),
  select: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
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

vi.mock("./db/schema", () => ({
  jobs: {
    id: "id",
    status: "status",
    attempts: "attempts",
    startedAt: "startedAt",
    runAt: "runAt",
    finishedAt: "finishedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  lte: vi.fn((col: unknown, val: unknown) => ({ op: "lte", col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: "gte", col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: "lt", col, val })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  desc: vi.fn((col: unknown) => ({ op: "desc", col })),
  inArray: vi.fn((col: unknown, val: unknown) => ({ op: "inArray", col, val })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("?"),
      values,
    }),
    { raw: (s: string) => ({ sql: s }) }
  ),
}));

import { drain, enqueue } from "./index";

type FakeJob = {
  id: string;
  kind: string;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  payload: Record<string, unknown> | null;
};

function job(overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    id: "j-1",
    kind: "credits.cleanup",
    attempts: 1,
    maxAttempts: 3,
    runAt: new Date("2026-08-25T00:00:00Z"),
    payload: null,
    ...overrides,
  };
}

type Cond = { op: string; col?: unknown; val?: unknown; args?: Cond[] };

/** The job id an update's where clause names, if any. */
function idOf(cond: Cond | undefined): unknown {
  if (!cond) return undefined;
  if (cond.op === "eq" && cond.col === "id") return cond.val;
  return cond.args?.map(idOf).find((v) => v !== undefined);
}

/** The startedAt value an update's where clause requires, if any. */
function heldAt(cond: Cond | undefined): unknown {
  if (!cond) return undefined;
  if (cond.op === "eq" && cond.col === "startedAt") return cond.val;
  return cond.args?.map(heldAt).find((v) => v !== undefined);
}

/** set() payload of the last update for a given job id — its outcome. */
function setFor(id: string) {
  const ids = mocks.updateWhere.mock.calls.map((c) => idOf(c[0] as Cond));
  const idx = ids.lastIndexOf(id);
  return idx >= 0
    ? (mocks.updateSet.mock.calls[idx]![0]! as Record<string, unknown>)
    : undefined;
}

/** Outcome writes: updates that set a status after the handler ran. */
function outcomeWrites(id: string) {
  return mocks.updateWhere.mock.calls
    .map((c, i) => ({
      id: idOf(c[0] as Cond),
      held: heldAt(c[0] as Cond),
      set: mocks.updateSet.mock.calls[i]![0]! as Record<string, unknown>,
    }))
    .filter((w) => w.id === id && "lastError" in w.set);
}

function updateResult(cond: Cond) {
  return Object.assign(Promise.resolve(undefined), {
    returning: (fields?: unknown) =>
      fields ? mocks.started(idOf(cond)) : mocks.claimed(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  // The claim returns whole rows; the per-job start returns the ids this
  // worker still holds.
  mocks.updateWhere.mockImplementation(updateResult);
  mocks.started.mockImplementation(async (id: unknown) => [{ id }]);
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    for: () => chain,
  };
  mocks.select.mockReturnValue(chain);
});

describe("enqueue", () => {
  it("defaults to runnable now with three attempts", async () => {
    const id = await enqueue({ kind: "credits.cleanup" });

    expect(id).toBeTruthy();
    const row = mocks.insertValues.mock.calls[0]![0]! as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject({ kind: "credits.cleanup", maxAttempts: 3 });
    expect(row.runAt).toBeInstanceOf(Date);
  });

  it("carries payload, workspace, and a delayed runAt", async () => {
    const runAt = new Date("2026-09-01T00:00:00Z");
    await enqueue({
      kind: "report.export",
      payload: { reportId: "r-1" },
      workspaceId: "ws-1",
      runAt,
      maxAttempts: 5,
    });

    expect(mocks.insertValues.mock.calls[0]![0]).toMatchObject({
      kind: "report.export",
      payload: { reportId: "r-1" },
      workspaceId: "ws-1",
      runAt,
      maxAttempts: 5,
    });
  });
});

describe("drain", () => {
  it("marks a handled job succeeded", async () => {
    mocks.claimed.mockResolvedValue([job()]);
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ claimed: 1, succeeded: 1, failed: 0 });
    expect(setFor("j-1")).toMatchObject({
      status: "succeeded",
      lastError: null,
    });
  });

  it("returns an unknown kind to pending without burning an attempt", async () => {
    mocks.claimed.mockResolvedValue([job({ kind: "unknown.kind" })]);

    const result = await drain({ "credits.cleanup": vi.fn() });

    expect(result.unhandled).toEqual(["unknown.kind"]);
    expect(result.succeeded).toBe(0);
    expect(setFor("j-1")).toMatchObject({ status: "pending" });
    expect((setFor("j-1")!.runAt as Date).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it("reschedules a failing job with backoff while attempts remain", async () => {
    mocks.claimed.mockResolvedValue([job({ attempts: 1 })]);

    const result = await drain({
      "credits.cleanup": vi.fn().mockRejectedValue(new Error("upstream down")),
    });

    expect(result.failed).toBe(1);
    const fields = setFor("j-1")!;
    expect(fields.status).toBe("pending");
    expect(fields.lastError).toBe("upstream down");
    expect((fields.runAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("gives up once attempts reach maxAttempts", async () => {
    mocks.claimed.mockResolvedValue([job({ attempts: 3, maxAttempts: 3 })]);

    await drain({
      "credits.cleanup": vi.fn().mockRejectedValue(new Error("still down")),
    });

    const fields = setFor("j-1")!;
    expect(fields.status).toBe("failed");
    expect(fields.finishedAt).toBeInstanceOf(Date);
  });

  it("keeps processing the batch after one handler throws", async () => {
    mocks.claimed.mockResolvedValue([job({ id: "j-1" }), job({ id: "j-2" })]);
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ claimed: 2, succeeded: 1, failed: 1 });
  });

  it("truncates a very long error message", async () => {
    mocks.claimed.mockResolvedValue([job()]);

    await drain({
      "credits.cleanup": vi.fn().mockRejectedValue(new Error("x".repeat(4000))),
    });

    expect((setFor("j-1")!.lastError as string).length).toBe(1000);
  });

  it("skips a job another worker claimed while it waited in the batch", async () => {
    mocks.claimed.mockResolvedValue([job({ id: "j-1" }), job({ id: "j-2" })]);
    mocks.started.mockImplementation(async (id: unknown) =>
      id === "j-2" ? [] : [{ id }]
    );
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ id: "j-1" });
    expect(outcomeWrites("j-2")).toEqual([]);
    expect(result).toMatchObject({ claimed: 2, succeeded: 1, failed: 0 });
  });

  it("writes the outcome only over the start this worker stamped", async () => {
    mocks.claimed.mockResolvedValue([job()]);

    await drain({ "credits.cleanup": vi.fn().mockResolvedValue(undefined) });

    const start = mocks.updateSet.mock.calls.findIndex(
      (c) => Object.keys(c[0] as object).join() === "startedAt"
    );
    const stamped = (
      mocks.updateSet.mock.calls[start]![0] as {
        startedAt: Date;
      }
    ).startedAt;
    const [write] = outcomeWrites("j-1");
    expect(write!.held).toBe(stamped);
  });

  it("does not re-queue a job whose handler succeeded when the status write fails", async () => {
    mocks.claimed.mockResolvedValue([job()]);
    let failures = 1;
    mocks.updateWhere.mockImplementation((cond: Cond) => {
      const fields = mocks.updateSet.mock.lastCall![0] as {
        status?: string;
      };
      if (fields.status === "succeeded" && failures-- > 0) {
        return Object.assign(Promise.reject(new Error("connection lost")), {
          returning: vi.fn(),
        });
      }
      return updateResult(cond);
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    const statuses = outcomeWrites("j-1").map((w) => w.set.status);
    expect(statuses).toEqual(["succeeded", "succeeded"]);
  });

  it("keeps draining the batch when a job's bookkeeping write throws", async () => {
    mocks.claimed.mockResolvedValue([job({ id: "j-1" }), job({ id: "j-2" })]);
    mocks.started.mockImplementation(async (id: unknown) => {
      if (id === "j-1") throw new Error("connection lost");
      return [{ id }];
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ id: "j-2" });
    expect(result).toMatchObject({ claimed: 2, succeeded: 1 });
  });

  it("reports an empty batch without touching handlers", async () => {
    mocks.claimed.mockResolvedValue([]);
    const handler = vi.fn();

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
      unhandled: [],
      deferred: 0,
    });
  });
});
