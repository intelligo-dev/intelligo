import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// A published package cannot assume the consumer's layout, so the env file
// defaults to the repository root and anything else is INTELLIGO_ENV_FILE.
const envPath = process.env.INTELLIGO_ENV_FILE ?? "../../.env";
config({ path: `${envPath}.local` });
config({ path: envPath });

/**
 * Core owns the migration history for the whole database, so packages that
 * own tables contribute their schema files here. A consumer's own tables come
 * from INTELLIGO_EXTRA_SCHEMA (colon-separated paths).
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
  // camelCase fields in TypeScript, snake_case columns in PostgreSQL.
  casing: "snake_case",
});
