/**
 * Per-day bucketing against a real database.
 *
 * The expression that buckets a day is built in TypeScript but
 * evaluated by Postgres, and both of its pitfalls are invisible to a
 * mock.
 *
 * Arithmetic: `started_at` is a naive `timestamp` holding a UTC instant,
 * so `started_at AT TIME ZONE $zone` does not convert it — it *declares*
 * it to already be in that zone, which is a different moment. Only the
 * pair, `AT TIME ZONE 'UTC' AT TIME ZONE $zone`, reads the stored
 * instant as wall time where the reader sits.
 *
 * Grouping: Drizzle inlines a `sql` fragment once per clause, so a bound
 * zone becomes three different placeholders and Postgres no longer
 * recognises the grouped expression as the selected one ("must appear in
 * the GROUP BY clause"). A literal zone matches textually and hides
 * this, which is why the query groups by ordinal and this test runs the
 * real statement.
 *
 * The three rows are chosen so UTC and New York disagree about *every*
 * one of them: a regression cannot pass by landing on a day both zones
 * happen to share.
 *
 * Runs only when TEST_PG_URL is set, and expects it to name the same
 * database as DATABASE_URL (which is what drizzle's `db` reads), as the
 * lifecycle integration test does.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

import { summarizeExecutionsByDay } from "../queries";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("summarizeExecutionsByDay (integration)", () => {
  const client = new Client({ connectionString: PG_URL });
  const suffix = Date.now();
  const workspaceId = `tz-it-ws-${suffix}`;
  const userId = `tz-it-user-${suffix}`;

  // Deliberately wide, so that however the driver serialises these
  // bounds against a naive column, no row sits near an edge.
  const window = {
    from: new Date("2026-03-01T00:00:00Z"),
    to: new Date("2026-03-20T00:00:00Z"),
  };

  /**
   * Written as SQL literals rather than JS `Date`s: node-postgres
   * serialises a Date into a naive `timestamp` using the *client
   * machine's* local wall time, so seeding with dates would store
   * different instants on a developer's laptop than in CI and quietly
   * invalidate every expectation below. Production writes these rows
   * with `now()` under a UTC session, which is what these match.
   */
  const rows: Array<[string, string, number]> = [
    // 02:00Z on the 12th is 21:00 on the 11th in New York.
    ["tz-it-a", "2026-03-12 02:00:00", 100],
    // 18:00Z on the 12th is 13:00 the same day.
    ["tz-it-b", "2026-03-12 18:00:00", 200],
    // 03:30Z on the 13th is 22:30 on the 12th.
    ["tz-it-c", "2026-03-13 03:30:00", 400],
  ];

  beforeAll(async () => {
    await client.connect();
    await client.query(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'TZ IT', $2, true, now(), now())`,
      [userId, `tz-it-${suffix}@example.test`]
    );
    await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ($1, 'TZ IT WS', $2, now(), now())`,
      [workspaceId, `tz-it-${suffix}`]
    );

    for (const [id, startedAt, tokens] of rows) {
      await client.query(
        `INSERT INTO executions
           (id, workspace_id, user_id, capability, request_id, status,
            total_tokens, charged_micros, currency, started_at)
         VALUES ($1, $2, $3, 'test.tz', $4, 'succeeded', $5, 1000, 'USD',
                 $6::timestamp)`,
        [
          `${id}-${suffix}`,
          workspaceId,
          userId,
          `${id}-req-${suffix}`,
          tokens,
          startedAt,
        ]
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM executions WHERE workspace_id = $1`, [
      workspaceId,
    ]);
    await client.query(`DELETE FROM organization WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  /** `{ day: tokens }`, which is what a chart actually draws. */
  async function tokensByDay(timeZone?: string) {
    const summary = await summarizeExecutionsByDay(
      workspaceId,
      window,
      timeZone ? { timeZone } : {}
    );
    return Object.fromEntries(
      summary.map((row) => [row.date, Number(row.totalTokens)])
    );
  }

  it("buckets by UTC day when no zone is given", async () => {
    expect(await tokensByDay()).toEqual({
      "2026-03-12": 300, // the 02:00 and 18:00 rows
      "2026-03-13": 400,
    });
  });

  it("buckets by the reader's day when a zone is given", async () => {
    expect(await tokensByDay("America/New_York")).toEqual({
      "2026-03-11": 100, // 02:00Z on the 12th, still the 11th there
      "2026-03-12": 600, // 18:00Z on the 12th and 03:30Z on the 13th
    });
  });

  it("splits the same rows differently again for a reader east of UTC", async () => {
    // +08:00, so the boundary falls in the other direction from New
    // York's: 02:00Z is 10:00 the same morning, but 18:00Z has already
    // become 02:00 the next day. Three zones, three different splits of
    // one set of rows — which is the property the page depends on.
    expect(await tokensByDay("Asia/Ulaanbaatar")).toEqual({
      "2026-03-12": 100, // 02:00Z → 10:00 on the 12th
      "2026-03-13": 600, // 18:00Z → 02:00, and 03:30Z → 11:30, on the 13th
    });
  });

  it("counts requests and sums the charge per day", async () => {
    const summary = await summarizeExecutionsByDay(workspaceId, window, {
      timeZone: "America/New_York",
    });
    const twelfth = summary.find((row) => row.date === "2026-03-12");

    expect(twelfth).toMatchObject({ count: 2 });
    expect(twelfth!.charged).toEqual([{ amount: 2000, currency: "USD" }]);
  });

  it("returns the days in ascending order", async () => {
    const dates = (
      await summarizeExecutionsByDay(workspaceId, window, {
        timeZone: "America/New_York",
      })
    ).map((row) => row.date);

    expect([...dates].sort()).toEqual(dates);
  });
});
