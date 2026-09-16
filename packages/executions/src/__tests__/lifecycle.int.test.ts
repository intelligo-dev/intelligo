/**
 * Integration test for the execution lifecycle against a real database.
 *
 * Every other test of this package mocks `@intelligo-dev/core/db`,
 * `@intelligo-dev/audit`, and drizzle, so they verify the control flow and
 * nothing about the SQL. The verification audit named this precisely:
 * the boundary had never once run begin→complete against a real
 * Postgres, a real audit table, or a real conditional UPDATE.
 *
 * That matters because the correctness of this package rests on a
 * compare-and-swap — `UPDATE ... WHERE status = 'running'` — whose
 * whole point is what the database does with concurrent writers. A
 * mock returning `[{id}]` proves nothing about it.
 *
 * Runs only when TEST_PG_URL is set (CI's e2e job points it at the
 * replayed database).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

import { money } from "@intelligo-dev/core/money";

import { createExecutions } from "../lifecycle";
import { getExecutionByRequestId, findStaleExecutions } from "../queries";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("execution lifecycle (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = Date.now();
  const workspaceId = `exec-it-ws-${suffix}`;
  const userId = `exec-it-user-${suffix}`;

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Exec IT', $2, true, now(), now())`,
      [userId, `exec-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'Exec IT WS', $2, now(), now())`,
      [workspaceId, `exec-it-${suffix}`]
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM executions WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    // audit_events is append-only (migration 0041); deleting the workspace
    // below nulls its rows' workspace_id instead.
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  async function auditActions(resourceId: string): Promise<string[]> {
    const { rows } = await client.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY created_at`,
      [resourceId]
    );
    return rows.map((r) => r.action);
  }

  it("records a full begin → complete cycle with usage and an audit event", async () => {
    const settled: unknown[] = [];
    const executions = createExecutions({
      settleUsage: async (s) => {
        settled.push(s);
        return { charged: money(42, "MNT") };
      },
    });

    const run = await executions.begin({
      workspaceId,
      userId,
      capability: "test.capability",
      model: "test/model",
    });
    await run.complete({ usage: { inputTokens: 10, outputTokens: 20 } });

    const row = await getExecutionByRequestId(run.requestId);
    expect(row).toMatchObject({
      workspaceId,
      userId,
      capability: "test.capability",
      status: "succeeded",
      totalTokens: 30,
      chargedMicros: 42,
      currency: "MNT",
    });
    expect(row!.finishedAt).toBeTruthy();
    expect(settled).toHaveLength(1);
    expect(await auditActions(run.id)).toEqual(["execution.completed"]);
  });

  it("records a refusal without running anything", async () => {
    const executions = createExecutions({
      checkEntitlement: async () => ({
        allowed: false,
        reason: "Out of credits",
        estimated: money(1500, "MNT"),
      }),
    });

    const run = await executions.begin({
      workspaceId,
      userId,
      capability: "test.refused",
    });

    expect(run.allowed).toBe(false);
    const row = await getExecutionByRequestId(run.requestId);
    expect(row).toMatchObject({
      status: "refused",
      refusalReason: "Out of credits",
      reservedMicros: 1500,
    });
    expect(await auditActions(run.id)).toEqual(["execution.refused"]);
  });

  it("releases the hold and records the error on failure", async () => {
    const released: string[] = [];
    const executions = createExecutions({
      releaseHold: async ({ requestId }) => {
        released.push(requestId);
      },
    });

    const run = await executions.begin({
      workspaceId,
      userId,
      capability: "test.failed",
    });
    await run.fail({ error: new Error("provider exploded") });

    const row = await getExecutionByRequestId(run.requestId);
    expect(row).toMatchObject({
      status: "failed",
      errorMessage: "provider exploded",
    });
    expect(released).toEqual([run.requestId]);
    expect(await auditActions(run.id)).toEqual(["execution.failed"]);
  });

  it("charges exactly once when two completes race — the real CAS, not a mock", async () => {
    let charges = 0;
    const executions = createExecutions({
      settleUsage: async () => {
        charges += 1;
        return { charged: money(7, "MNT") };
      },
    });

    const run = await executions.begin({
      workspaceId,
      userId,
      capability: "test.race",
    });

    await Promise.all([
      run.complete({ usage: { totalTokens: 5 } }),
      run.complete({ usage: { totalTokens: 5 } }),
    ]);

    expect(charges).toBe(1);
    expect((await getExecutionByRequestId(run.requestId))!.status).toBe(
      "succeeded"
    );
  });

  it("leaves a settlement failure visible to the stale sweep", async () => {
    const executions = createExecutions({
      settleUsage: async () => {
        throw new Error("ledger unavailable");
      },
    });

    const run = await executions.begin({
      workspaceId,
      userId,
      capability: "test.unsettled",
    });
    await expect(run.complete({ usage: { totalTokens: 5 } })).rejects.toThrow(
      "ledger unavailable"
    );

    // Not succeeded — unrecorded usage must never look like a free turn.
    const row = await getExecutionByRequestId(run.requestId);
    expect(row!.status).toBe("settling");

    const stale = await findStaleExecutions(new Date(Date.now() + 60_000));
    expect(stale.map((e) => e.requestId)).toContain(run.requestId);
  });
});
