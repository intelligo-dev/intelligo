/**
 * Integration health.
 *
 * The properties worth pinning: a probe that throws must not take the
 * page down with it, an overdue job backlog must read as `down` rather
 * than `degraded` (it means no worker is running), unsettled
 * executions must be visible because they are held credit, and the
 * in-memory payment mock must read as `down` in production.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  counts: [] as number[],
}));

// Each `db.select().from().where()` resolves to the next queued count.
vi.mock("@intelligo/core/db", () => ({
  db: {
    execute: mocks.execute,
    select: () => ({
      from: () => ({
        where: async () => [{ n: mocks.counts.shift() ?? 0 }],
      }),
    }),
  },
}));

vi.mock("@intelligo/executions", () => ({
  executions: { status: "status", startedAt: "startedAt" },
}));

vi.mock("@intelligo/jobs", () => ({
  jobs: {
    status: "status",
    runAt: "runAt",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  gte: (...a: unknown[]) => ({ gte: a }),
  inArray: (...a: unknown[]) => ({ inArray: a }),
  lt: (...a: unknown[]) => ({ lt: a }),
  sql: Object.assign((..._a: unknown[]) => ({ sql: true }), {
    raw: () => ({ sql: true }),
  }),
}));

vi.mock("server-only", () => ({}));

import {
  clearIntegrationProbes,
  getIntegrationHealth,
  registerIntegrationProbe,
} from "./health";

/** Queue counts in the order the checks consume them. */
function queueCounts({
  jobsPending = 0,
  jobsOverdue = 0,
  jobsFailed = 0,
  unsettled = 0,
}: {
  jobsPending?: number;
  jobsOverdue?: number;
  jobsFailed?: number;
  unsettled?: number;
} = {}) {
  mocks.counts = [jobsPending, jobsOverdue, jobsFailed, unsettled];
}

function find(
  rows: Awaited<ReturnType<typeof getIntegrationHealth>>,
  key: string
) {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`no health row for ${key}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearIntegrationProbes();
  mocks.execute.mockResolvedValue(undefined);
  vi.unstubAllEnvs();
  queueCounts();
});

describe("getIntegrationHealth", () => {
  it("reports the built-in integrations", async () => {
    const rows = await getIntegrationHealth();

    // Built-ins are only the parts Intelligo owns outright. Payment,
    // mail and model providers are the product's, registered by its
    // composition root — admin may not even import billing.
    expect(rows.map((r) => r.key).sort()).toEqual([
      "database",
      "jobs",
      "settlement",
    ]);
  });

  it("reads a healthy database round-trip as ok", async () => {
    const rows = await getIntegrationHealth();

    expect(find(rows, "database").status).toBe("ok");
  });

  it("reports the database as down when the round-trip throws", async () => {
    mocks.execute.mockRejectedValue(new Error("connection refused"));

    const row = find(await getIntegrationHealth(), "database");

    expect(row.status).toBe("down");
    expect(row.detail).toContain("connection refused");
  });

  it("calls an overdue job backlog down, not degraded", async () => {
    // Jobs whose run time has passed by 15 minutes mean nothing is
    // draining the queue — worse than a large but moving backlog.
    queueCounts({ jobsPending: 40, jobsOverdue: 12 });

    const row = find(await getIntegrationHealth(), "jobs");

    expect(row.status).toBe("down");
    expect(row.detail).toContain("no worker");
    expect(row.metrics).toMatchObject({ overdue: 12 });
  });

  it("calls exhausted retries degraded when the queue is moving", async () => {
    queueCounts({ jobsPending: 3, jobsOverdue: 0, jobsFailed: 2 });

    const row = find(await getIntegrationHealth(), "jobs");

    expect(row.status).toBe("degraded");
    expect(row.metrics).toMatchObject({ failed24h: 2, overdue: 0 });
  });

  it("surfaces unsettled executions as held credit", async () => {
    queueCounts({ unsettled: 3 });

    const row = find(await getIntegrationHealth(), "settlement");

    expect(row.status).toBe("degraded");
    expect(row.detail).toContain("credit is still held");
  });

  it("includes probes registered by the product", async () => {
    registerIntegrationProbe({
      key: "stripe",
      label: "Stripe",
      check: async () => ({ status: "ok", detail: "Webhook secret set." }),
    });

    expect(find(await getIntegrationHealth(), "stripe").label).toBe("Stripe");
  });

  it("does not let one failing probe take the page down", async () => {
    registerIntegrationProbe({
      key: "email",
      label: "Email",
      check: async () => {
        throw new Error("resend unreachable");
      },
    });

    const rows = await getIntegrationHealth();

    expect(find(rows, "email").status).toBe("down");
    expect(find(rows, "database").status).toBe("ok");
  });

  it("replaces a probe re-registered under the same key", async () => {
    registerIntegrationProbe({
      key: "email",
      label: "Email",
      check: async () => ({ status: "ok", detail: "first" }),
    });
    registerIntegrationProbe({
      key: "email",
      label: "Email",
      check: async () => ({ status: "ok", detail: "second" }),
    });

    const rows = await getIntegrationHealth();

    expect(rows.filter((r) => r.key === "email")).toHaveLength(1);
    expect(find(rows, "email").detail).toBe("second");
  });
});
