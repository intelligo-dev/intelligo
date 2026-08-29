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
  execute: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@intelligo/core/db", () => ({
  db: {
    execute: mocks.execute,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@intelligo/core/logger", () => ({
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
    finishedAt: "finishedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  lte: vi.fn((col: unknown, val: unknown) => ({ op: "lte", col, val })),
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

/** set() payload of the update for a given job id. */
function setFor(id: string) {
  const idx = mocks.updateWhere.mock.calls.findIndex(
    (c) => (c[0] as { val?: string }).val === id
  );
  return idx >= 0
    ? (mocks.updateSet.mock.calls[idx]![0]! as Record<string, unknown>)
    : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockResolvedValue(undefined);
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
    mocks.execute.mockResolvedValue({ rows: [job()] });
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
    mocks.execute.mockResolvedValue({ rows: [job({ kind: "unknown.kind" })] });

    const result = await drain({ "credits.cleanup": vi.fn() });

    expect(result.unhandled).toEqual(["unknown.kind"]);
    expect(result.succeeded).toBe(0);
    expect(setFor("j-1")).toMatchObject({ status: "pending" });
  });

  it("reschedules a failing job with backoff while attempts remain", async () => {
    mocks.execute.mockResolvedValue({ rows: [job({ attempts: 1 })] });

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
    mocks.execute.mockResolvedValue({
      rows: [job({ attempts: 3, maxAttempts: 3 })],
    });

    await drain({
      "credits.cleanup": vi.fn().mockRejectedValue(new Error("still down")),
    });

    const fields = setFor("j-1")!;
    expect(fields.status).toBe("failed");
    expect(fields.finishedAt).toBeInstanceOf(Date);
  });

  it("keeps processing the batch after one handler throws", async () => {
    mocks.execute.mockResolvedValue({
      rows: [job({ id: "j-1" }), job({ id: "j-2" })],
    });
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ claimed: 2, succeeded: 1, failed: 1 });
  });

  it("truncates a very long error message", async () => {
    mocks.execute.mockResolvedValue({ rows: [job()] });

    await drain({
      "credits.cleanup": vi.fn().mockRejectedValue(new Error("x".repeat(4000))),
    });

    expect((setFor("j-1")!.lastError as string).length).toBe(1000);
  });

  it("reports an empty batch without touching handlers", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const handler = vi.fn();

    const result = await drain({ "credits.cleanup": handler });

    expect(handler).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
      unhandled: [],
    });
  });
});
