---
title: Reference data
description: Tables every workspace reads and none owns — holidays, rates, a catalogue of benchmarks — and the script that loads them from outside the app.
order: 8
---

Most of an app's tables hold a workspace's data and are scoped to it. Some hold facts about the world that every workspace reads the same: public holidays, a currency's history, aggregate benchmarks computed elsewhere. This page is about those. At its end the app has a global table, a script that replaces its contents in one transaction, and a tool that reads it.

## The one table without a workspace

`lib/db/schema.ts` says to scope every table to a workspace. A reference table is the exception, and it stays one only while nothing in it belongs to a workspace or a user:

```ts title="lib/db/schema.ts"
import { date, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Public holidays by country. Global: every workspace reads the same rows. */
export const publicHolidays = pgTable(
  "public_holidays",
  {
    country: text("country").notNull(),
    day: date("day").notNull(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    loadedAt: timestamp("loaded_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.country, t.day] })]
);
```

Keep a `source` column: when a figure is questioned, the row says where it came from. `pnpm db:generate` writes the migration and `pnpm db:migrate` applies it after the framework's chain.

The rule that keeps it safe is the read path. Workspace tables are filtered by `withWorkspaceFilter`. A reference table has nothing to filter, so it must hold nothing to leak: no ids of people, no workspace's own numbers, no rows built from fewer people than you would publish.

## Load it with a script

Reference data arrives from outside the app: an export, a nightly job, a file a colleague computed. Load it with a script you run, not from a request. Replace the whole table in one transaction, so a reader sees the old rows or the new ones and never half of each. The app already has `pg` as a pinned devDependency, so only its types are added:

```bash
pnpm add -D @types/pg
```

```ts title="scripts/load-holidays.ts"
/**
 * Replaces public_holidays with data/holidays.json, in one transaction.
 *
 *   node --env-file=.env.local scripts/load-holidays.ts
 */
import { readFileSync } from "node:fs";

import pg from "pg";

type Holiday = { country: string; day: string; name: string };

const rows = JSON.parse(
  readFileSync("data/holidays.json", "utf8")
) as Holiday[];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("delete from public_holidays");
  for (const row of rows) {
    await client.query(
      "insert into public_holidays (country, day, name, source) values ($1, $2, $3, $4)",
      [row.country, row.day, row.name, "data/holidays.json"]
    );
  }
  await client.query("commit");
  console.log(`public_holidays: ${rows.length} rows`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
```

Node 22.18 and later run a `.ts` file directly. The script imports nothing from the app, so it needs no path alias and no bundler. Add it to `package.json` as `"data:holidays": "node --env-file=.env.local scripts/load-holidays.ts"`. Keep the data file itself out of the repository when it is large or not yours to publish, and `.gitignore` its folder.

## Read it from a tool

The table is read like any other: through the app's `db`, with no workspace filter, because there is none to apply.

```ts title="lib/holidays.ts"
import { and, eq, gte } from "drizzle-orm";

import { db } from "@intelligo-dev/core/db";

import { publicHolidays } from "@/lib/db/schema";

export function upcomingHolidays(country: string, from: string) {
  return db
    .select()
    .from(publicHolidays)
    .where(and(eq(publicHolidays.country, country), gte(publicHolidays.day, from)))
    .orderBy(publicHolidays.day)
    .limit(10);
}
```

A tool that hands these rows to the model gives it a source for every date and figure it states.
