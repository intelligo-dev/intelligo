import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Environment for the drizzle-kit CLI. A published @intelligo-dev/core
// cannot assume the consumer's layout, so the default is the repository
// root and anything else is INTELLIGO_ENV_FILE. This workspace sets it
// in the root package.json's db:* scripts — keeping the product
// application's path out of a package headed for publication (ADR-0006).
const envPath = process.env.INTELLIGO_ENV_FILE ?? "../../.env";
config({ path: `${envPath}.local` });
config({ path: envPath });

/**
 * Schema files drizzle-kit scans.
 *
 * Core owns the migration history for the whole database, so packages
 * that own tables contribute their schema files here. Anything outside
 * `packages/` — a vertical's own tables, a consumer's product tables —
 * comes from INTELLIGO_EXTRA_SCHEMA (colon-separated). Defaulting it to
 * a path would mean a public package naming a private one, and would
 * also be wrong for every consumer but this repository (ADR-0006).
 */
const extraSchema = (process.env.INTELLIGO_EXTRA_SCHEMA ?? "")
  .split(":")
  .filter(Boolean);

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/db/schema/*",
    "../audit/src/db/schema.ts",
    "../executions/src/db/schema.ts",
    "../jobs/src/db/schema.ts",
    ...extraSchema,
  ],
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Map TypeScript camelCase fields to PostgreSQL snake_case columns
  // while keeping the TypeScript API camelCase (covers DB-03, TECH-01)
  casing: "snake_case",
});
