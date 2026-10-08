/**
 * Trial reminders and trial status against a real database: a reminder
 * whose email was not sent is sent again by a later run, one that was
 * sent is not, a run sends no more than its limit, and the warning
 * follows the money grant admission spends rather than the token count.
 * The email sender is mocked.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Client } from "pg";

const email = vi.hoisted(() => ({ sendTrialExpiryEmail: vi.fn() }));

vi.mock("@intelligo-dev/core/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@intelligo-dev/core/email")>()),
  sendTrialExpiryEmail: email.sendTrialExpiryEmail,
}));

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

const suffix = Date.now();
const PRODUCT = `trial-reminders-${suffix}`;
const OWNER = `user_trial_reminders_${suffix}`;
const WORKSPACES = [0, 1, 2].map((i) => `ws_trial_reminders_${suffix}_${i}`);
const REMIND_IN_DAYS = 3;

d("trial reminders and status (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  let trial: typeof import("../trial");

  const reminded = async () =>
    (
      await client.query<{ workspace_id: string }>(
        `SELECT workspace_id FROM notification_history
          WHERE workspace_id = ANY($1) AND type = 'trial_expiry_reminder'
          ORDER BY workspace_id`,
        [WORKSPACES]
      )
    ).rows.map((row) => row.workspace_id);

  const cleanUp = async () => {
    await client.query(`DELETE FROM organization WHERE id = ANY($1)`, [
      WORKSPACES,
    ]);
    await client.query(`DELETE FROM users WHERE id = $1`, [OWNER]);
    // A trial grant outlives its workspace.
    await client.query(`DELETE FROM trial_credits WHERE id = ANY($1)`, [
      WORKSPACES,
    ]);
  };

  beforeAll(async () => {
    await client.connect();
    const registry = await import("../plan-registry");
    registry.setDefaultProductSlug(PRODUCT);
    const { fromMajor } = await import("@intelligo-dev/core/money");
    registry.registerTrialConfig(PRODUCT, {
      initialCredits: 0,
      grant: fromMajor(5, "USD"),
      durationDays: 14,
      warningThreshold: 0.2,
      reminderDaysBeforeExpiry: REMIND_IN_DAYS,
    });
    trial = await import("../trial");
  });

  beforeEach(async () => {
    email.sendTrialExpiryEmail.mockReset();
    email.sendTrialExpiryEmail.mockResolvedValue({ success: true });
    await cleanUp();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Owner', $2, true, now(), now())`,
      [OWNER, `${OWNER}@example.test`]
    );
    for (const id of WORKSPACES) {
      await client.query(
        `INSERT INTO organization (id, name, slug) VALUES ($1, 'Trial', $1)`,
        [id]
      );
      await client.query(
        `INSERT INTO member (id, organization_id, user_id, role) VALUES ($1, $1, $2, 'owner')`,
        [id, OWNER]
      );
      // Ends at noon UTC on the reminder day.
      await client.query(
        `INSERT INTO trial_credits
           (id, workspace_id, status, initial_credits, credits_remaining,
            initial_micros, remaining_micros, currency, trial_end_date)
         VALUES ($1, $1, 'active', 0, 0, 5000000, 5000000, 'USD',
                 date_trunc('day', now() AT TIME ZONE 'UTC') + ($2 || ' days')::interval + interval '12 hours')`,
        [id, REMIND_IN_DAYS]
      );
    }
  });

  afterAll(async () => {
    await cleanUp();
    await client.end();
  });

  it("sends a reminder again when the first send failed, and not after it succeeded", async () => {
    email.sendTrialExpiryEmail.mockResolvedValueOnce({
      success: false,
      error: "domain not verified",
    });
    const first = await trial.processTrialExpirations();
    expect(first.remindersSent).toBe(2);
    expect(first.errors).toHaveLength(1);
    expect(await reminded()).toHaveLength(2);

    const second = await trial.processTrialExpirations();
    expect(second.remindersSent).toBe(1);
    expect(await reminded()).toEqual(WORKSPACES);

    const third = await trial.processTrialExpirations();
    expect(third.remindersSent).toBe(0);
    expect(email.sendTrialExpiryEmail).toHaveBeenCalledTimes(4);
  });

  it("sends no more reminders than its limit, and the next run sends the rest", async () => {
    const first = await trial.processTrialExpirations({ reminderLimit: 2 });
    expect(first.remindersSent).toBe(2);
    const second = await trial.processTrialExpirations({ reminderLimit: 2 });
    expect(second.remindersSent).toBe(1);
    expect(await reminded()).toEqual(WORKSPACES);
  });

  it("warns from the money grant, not from a token count of zero", async () => {
    const full = await trial.getTrialStatus(WORKSPACES[0]!);
    expect(full).toMatchObject({ percentageRemaining: 100 });
    expect(full.warningTriggered).toBe(false);

    await client.query(
      `UPDATE trial_credits SET remaining_micros = 500000 WHERE workspace_id = $1`,
      [WORKSPACES[0]]
    );
    const low = await trial.getTrialStatus(WORKSPACES[0]!);
    expect(low).toMatchObject({
      percentageRemaining: 10,
      warningTriggered: true,
    });
  });
});
