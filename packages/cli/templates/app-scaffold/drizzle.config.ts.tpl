import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit does not load env files; Next.js does. Same precedence.
config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Your application's migration chain — and only yours.
 *
 * The framework's tables (users, workspaces, plans, credits, executions,
 * …) arrive inside `@intelligo-dev/core` together with their migration
 * history, and `intelligo migrate` applies that chain. This config
 * covers the tables you own: list their schema files here, generate
 * with `pnpm db:generate`, apply with `pnpm db:migrate`.
 *
 * Two chains, one database, so they record themselves in different
 * tables: the framework in drizzle's default `__drizzle_migrations`,
 * yours in `__app_migrations`. Do not merge them — drizzle-kit applies
 * by timestamp, and a framework migration published after you
 * generated one of yours would be skipped silently.
 *
 * Your schema may reference framework tables (`references(() =>
 * users.id)`); drizzle-kit emits the foreign key by name and does not
 * try to create the framework's table.
 *
 * Do not point `drizzle-kit push` at this config: push diffs the whole
 * database against the schema it sees, and this config deliberately
 * sees only yours.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./lib/db/schema.ts"],
  out: "./drizzle",
  migrations: { table: "__app_migrations", schema: "drizzle" },
  // The framework's columns are snake_case in Postgres and camelCase in
  // TypeScript. Keep the same convention so joins read naturally.
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
