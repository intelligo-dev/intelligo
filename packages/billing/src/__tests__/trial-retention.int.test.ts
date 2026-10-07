/**
 * A trial grant outlives its workspace: deleting the workspace detaches
 * the row instead of removing it, so the per-email abuse count still
 * sees it, and the expiry sweep expires it without looking for a
 * workspace to notify.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const WORKSPACE = "ws_trial_retention_test";
const EMAIL = "trial.retention+one@example.test";

d("trial grants after workspace deletion (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let trial: typeof import("../trial");

  const cleanUp = async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    await client.query(
      `DELETE FROM trial_credits WHERE created_by_email = $1`,
      [EMAIL]
    );
  };

  beforeAll(async () => {
    await client.connect();
    trial = await import("../trial");
  });

  beforeEach(async () => {
    await cleanUp();
    await client.query(
      `INSERT INTO organization (id, name, slug) VALUES ($1, 'Trial test', $1)`,
      [WORKSPACE]
    );
    await client.query(
      `INSERT INTO trial_credits
         (id, workspace_id, status, trial_end_date, created_by_email, normalized_email)
       VALUES ('trial_retention_1', $1, 'active', now() - interval '1 day', $2, $3)`,
      [WORKSPACE, EMAIL, trial.normalizeEmailForAbuseCheck(EMAIL)]
    );
  });

  afterAll(async () => {
    await cleanUp();
    await client.end();
  });

  it("keeps the grant, detached, when the workspace is deleted", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);

    const rows = (
      await client.query<{ workspace_id: string | null }>(
        `SELECT workspace_id FROM trial_credits WHERE id = 'trial_retention_1'`
      )
    ).rows;
    expect(rows).toEqual([{ workspace_id: null }]);
  });

  it("counts a deleted workspace's grant against the same email", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);
    for (const n of [2, 3]) {
      await client.query(
        `INSERT INTO trial_credits (id, status, created_by_email, normalized_email)
         VALUES ($1, 'expired', $2, $3)`,
        [
          `trial_retention_${n}`,
          EMAIL,
          trial.normalizeEmailForAbuseCheck(EMAIL),
        ]
      );
    }

    const verdict = await trial.checkTrialAbuse(
      "trial.retention+two@example.test"
    );
    expect(verdict.allowed).toBe(false);
  });

  it("expires a detached grant without a workspace to notify", async () => {
    await client.query(`DELETE FROM organization WHERE id = $1`, [WORKSPACE]);

    const result = await trial.processTrialExpirations();

    expect(result.errors.filter((e) => e.includes("null"))).toEqual([]);
    const status = (
      await client.query<{ status: string }>(
        `SELECT status FROM trial_credits WHERE id = 'trial_retention_1'`
      )
    ).rows[0]?.status;
    expect(status).toBe("expired");
  });
});
