/**
 * The execution lifecycle's call order, as a command model: begin,
 * complete, fail, progress and reconcile in any sequential order, with
 * settlement faults switched on and off and the clock moved past the
 * abandonment cutoff, against an in-memory table that honours the
 * compare-and-swap on `status`.
 *
 * Sequential only. Whether the compare-and-swap holds under concurrent
 * writers is a property of Postgres, which the integration suites test;
 * an in-memory table would prove nothing about it.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & {
  id: string;
  requestId: string;
  status: string;
  startedAt: Date;
  totalTokens: number | null;
  chargedMicros: number | null;
};

type Condition =
  { op: "eq"; col: string; val: unknown } | { op: "and"; args: Condition[] };

const table = vi.hoisted(() => new Map<string, Record<string, unknown>>());

function matches(row: Record<string, unknown>, where: Condition): boolean {
  if (where.op === "and") return where.args.every((c) => matches(row, c));
  return row[where.col] === where.val;
}

vi.mock("@intelligo-dev/core/db", () => {
  const insert = () => ({
    values: (values: Record<string, unknown>) => ({
      then: (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown
      ) => {
        const taken = [...table.values()].some(
          (row) => row.requestId === values.requestId
        );
        if (taken) {
          return Promise.reject(
            Object.assign(new Error("duplicate key"), { code: "23505" })
          ).then(resolve, reject);
        }
        table.set(values.id as string, {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          chargedMicros: null,
          ...values,
        });
        return Promise.resolve(undefined).then(resolve, reject);
      },
    }),
  });
  const update = () => ({
    set: (fields: Record<string, unknown>) => ({
      where: (where: Condition) => {
        // Applied once, by whichever of `returning()` or `await` asks.
        let applied: Record<string, unknown>[] | null = null;
        const apply = () => {
          if (applied) return applied;
          applied = [];
          for (const row of table.values()) {
            if (!matches(row, where)) continue;
            Object.assign(row, fields);
            applied.push({ ...row });
          }
          return applied;
        };
        return {
          returning: () => Promise.resolve(apply()),
          then: (
            resolve: (value: unknown) => unknown,
            reject: (error: unknown) => unknown
          ) => Promise.resolve(apply()).then(resolve, reject),
        };
      },
    }),
  });
  const select = () => ({
    from: () => ({
      where: (where: Condition) => ({
        limit: (n: number) =>
          Promise.resolve(
            [...table.values()]
              .filter((row) => matches(row, where))
              .slice(0, n)
              .map((row) => ({ ...row }))
          ),
      }),
    }),
  });
  return { db: { insert, update, select } };
});

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

vi.mock("@intelligo-dev/audit", () => ({
  recordAuditEvent: () => Promise.resolve(),
}));

vi.mock("./db/schema", () => ({
  executions: { id: "id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
}));

import { money } from "@intelligo-dev/core/money";

import { createExecutions } from "./lifecycle";
import type { ExecutionRun } from "./run";
import type { ExecutionPorts } from "./ports";

const CUTOFF_MS = 60_000;

type Fault = "none" | "throwBeforeCommit" | "throwAfterCommit";

/** The billing side, as the lifecycle's ports see it. */
class Ledger {
  fault: Fault = "none";
  readonly charges = new Map<string, number>();
  /** settleUsage calls for a request that was already charged. */
  readonly replays = new Map<string, number>();
  readonly releases = new Map<string, number>();
  readonly holds = new Set<string>();

  ports(refuse: () => boolean): ExecutionPorts {
    return {
      checkEntitlement: async ({ requestId }) => {
        if (refuse()) {
          return { allowed: false, code: "refused", reason: "No credits" };
        }
        this.holds.add(requestId);
        return { allowed: true, estimated: money(1_000_000, "USD") };
      },
      settleUsage: async ({ requestId, totalTokens }) => {
        if (this.fault === "throwBeforeCommit") {
          throw new Error("settlement failed before commit");
        }
        const existing = this.charges.get(requestId);
        if (existing !== undefined) {
          this.replays.set(requestId, (this.replays.get(requestId) ?? 0) + 1);
          return { charged: money(existing, "USD") };
        }
        this.charges.set(requestId, totalTokens);
        if (this.fault === "throwAfterCommit") {
          throw new Error("connection lost after commit");
        }
        return { charged: money(totalTokens, "USD") };
      },
      findSettlement: async ({ requestId }) => {
        const amount = this.charges.get(requestId);
        return amount === undefined ? null : { charged: money(amount, "USD") };
      },
      releaseHold: async ({ requestId }) => {
        this.releases.set(requestId, (this.releases.get(requestId) ?? 0) + 1);
      },
    };
  }
}

type Run = { handle: ExecutionRun };

type Model = { runs: number; fault: Fault };

type Real = {
  executions: ReturnType<typeof createExecutions>;
  ledger: Ledger;
  runs: Run[];
  refuseNext: boolean;
};

type Usage = { inputTokens: number; outputTokens: number };

function rowOf(run: Run): Row | undefined {
  return table.get(run.handle.id) as Row | undefined;
}

/** Runs a lifecycle call whose failure is part of the scenario. */
async function settled(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch {
    // A settlement fault surfaces as a throw; the invariants judge what
    // it left behind.
  }
}

/** I1, I2, I3 and I6, which hold after every command. */
function checkInvariants(real: Real): void {
  const { ledger } = real;
  for (const run of real.runs) {
    const { requestId, allowed } = run.handle;
    const row = rowOf(run)!;
    const charge = ledger.charges.get(requestId);
    const releases = ledger.releases.get(requestId) ?? 0;

    // I1: a request is settled once; nothing re-runs a settlement the
    // ledger already holds.
    expect(ledger.replays.get(requestId) ?? 0).toBe(0);

    if (!allowed) {
      // I6: a refused run holds nothing, so charges and releases nothing.
      expect(row.status).toBe("refused");
      expect(charge).toBeUndefined();
      expect(releases).toBe(0);
      continue;
    }

    // A hold ends at most one way.
    expect(charge !== undefined && releases > 0).toBe(false);
    expect(releases).toBeLessThanOrEqual(1);

    if (row.status === "succeeded") {
      // I2: succeeded means charged, and the row says what.
      expect(charge).toBeDefined();
      expect(row.chargedMicros).toBe(charge);
    }
    if (row.status === "failed") {
      // I3: failed means released and not charged.
      expect(charge).toBeUndefined();
      expect(releases).toBe(1);
    } else {
      expect(releases).toBe(0);
    }
  }
}

class Begin implements fc.AsyncCommand<Model, Real> {
  constructor(readonly refuse: boolean) {}
  check = () => true;
  async run(model: Model, real: Real) {
    real.refuseNext = this.refuse;
    const handle = await real.executions.begin({
      workspaceId: "ws-1",
      userId: "u-1",
      capability: "support.reply",
      model: "google/gemini-2.5-flash",
    });
    expect(handle.allowed).toBe(!this.refuse);
    real.runs.push({ handle });
    model.runs++;
    checkInvariants(real);
  }
  toString = () => `begin(${this.refuse ? "refused" : "allowed"})`;
}

abstract class OnRun implements fc.AsyncCommand<Model, Real> {
  constructor(readonly pick: number) {}
  check = (model: Readonly<Model>) => model.runs > 0;
  protected target(real: Real): Run {
    return real.runs[real.runs.length - 1 - (this.pick % real.runs.length)]!;
  }
  abstract run(model: Model, real: Real): Promise<void>;
}

class Complete extends OnRun {
  constructor(
    pick: number,
    readonly usage: Usage
  ) {
    super(pick);
  }
  async run(_model: Model, real: Real) {
    await settled(() =>
      this.target(real).handle.complete({ usage: this.usage })
    );
    checkInvariants(real);
  }
  toString = () =>
    `complete(#${this.pick}, ${this.usage.inputTokens}+${this.usage.outputTokens})`;
}

class Fail extends OnRun {
  async run(_model: Model, real: Real) {
    await this.target(real).handle.fail({ error: new Error("stream died") });
    checkInvariants(real);
  }
  toString = () => `fail(#${this.pick})`;
}

class Progress extends OnRun {
  constructor(
    pick: number,
    readonly usage: Usage
  ) {
    super(pick);
  }
  async run(_model: Model, real: Real) {
    await this.target(real).handle.progress?.({ usage: this.usage });
    checkInvariants(real);
  }
  toString = () =>
    `progress(#${this.pick}, ${this.usage.inputTokens}+${this.usage.outputTokens})`;
}

class Reconcile extends OnRun {
  async run(model: Model, real: Real) {
    const run = this.target(real);
    // A copy: the table's rows change in place.
    const before = { ...rowOf(run)! };
    const pastCutoff = Date.now() - before.startedAt.getTime() >= CUTOFF_MS;
    await settled(() =>
      real.executions.reconcile(run.handle.id, {
        abandonRunningAfterMs: CUTOFF_MS,
      })
    );
    checkInvariants(real);
    if (model.fault !== "none") return;
    const after = rowOf(run)!;
    const unfinished =
      before.status === "settling" || before.status === "running";
    if (unfinished && (before.status === "settling" || pastCutoff)) {
      // I4: with settlement working, reconcile finishes what it may.
      expect(["succeeded", "failed"]).toContain(after.status);
    }
    if (
      before.status === "running" &&
      pastCutoff &&
      (before.totalTokens ?? 0) > 0
    ) {
      // I5: a run abandoned after recording progress is charged for it.
      expect(after.status).toBe("succeeded");
      expect(
        real.ledger.charges.get(run.handle.requestId)
      ).toBeGreaterThanOrEqual(before.totalTokens!);
    }
  }
  toString = () => `reconcile(#${this.pick})`;
}

class SetSettleFault implements fc.AsyncCommand<Model, Real> {
  constructor(readonly fault: Fault) {}
  check = () => true;
  async run(model: Model, real: Real) {
    real.ledger.fault = this.fault;
    model.fault = this.fault;
  }
  toString = () => `fault(${this.fault})`;
}

class Advance implements fc.AsyncCommand<Model, Real> {
  constructor(readonly ms: number) {}
  check = () => true;
  async run() {
    vi.setSystemTime(Date.now() + this.ms);
  }
  toString = () => `advance(${this.ms}ms)`;
}

const usage = fc.record({
  inputTokens: fc.integer({ min: 0, max: 5_000 }),
  outputTokens: fc.integer({ min: 0, max: 5_000 }),
});

/** Which run a command acts on, counted back from the newest. */
const pick = fc.nat({ max: 3 });

const begin = fc.boolean().map((refuse) => new Begin(refuse));
const complete = fc.tuple(pick, usage).map(([p, u]) => new Complete(p, u));
const fail = pick.map((p) => new Fail(p));
const progress = fc.tuple(pick, usage).map(([p, u]) => new Progress(p, u));
const reconcile = pick.map((p) => new Reconcile(p));
const fault = fc
  .constantFrom<Fault>("none", "throwBeforeCommit", "throwAfterCommit")
  .map((f) => new SetSettleFault(f));
const advance = fc
  .constantFrom(1_000, CUTOFF_MS / 2, CUTOFF_MS, 5 * CUTOFF_MS)
  .map((ms) => new Advance(ms));

// Listed more than once to be drawn more often: a run left running,
// then found by reconcile past the cutoff, is the order most worth
// reaching, and terminal calls end it.
const commands = fc.commands(
  [
    begin,
    begin,
    complete,
    fail,
    progress,
    progress,
    reconcile,
    reconcile,
    reconcile,
    fault,
    advance,
    advance,
  ],
  { maxCommands: 40, size: "medium" }
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("execution lifecycle, any call order", () => {
  it("settles each run at most once, and finishes what reconcile may", async () => {
    await fc.assert(
      fc.asyncProperty(commands, async (cmds) => {
        table.clear();
        const ledger = new Ledger();
        const executions = createExecutions(
          ledger.ports(() => real.refuseNext)
        );
        const real: Real = { executions, ledger, runs: [], refuseNext: false };
        await fc.asyncModelRun(
          (): { model: Model; real: Real } => ({
            model: { runs: 0, fault: "none" },
            real,
          }),
          cmds
        );
      })
    );
  });
});
