import { db } from "./client";
import { sql } from "drizzle-orm";

export interface DatabaseValidationResult {
  isConnected: boolean;
  tablesExist: boolean;
  error?: string;
}

/** Checks that the database answers and the four auth tables exist. */
export async function validateDatabaseConnection(): Promise<DatabaseValidationResult> {
  try {
    await db.execute(sql`SELECT 1`);

    const result = await db.execute(sql`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'accounts', 'verifications')
    `);

    const tableCount = Number(result.rows[0]?.table_count ?? 0);
    const tablesExist = tableCount === 4;

    return {
      isConnected: true,
      tablesExist,
      error: tablesExist
        ? undefined
        : "Auth tables do not exist. Run 'intelligo migrate' to apply the framework's migration chain.",
    };
  } catch (error) {
    return {
      isConnected: false,
      tablesExist: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

/** Startup check: throws with setup instructions when validation fails. */
export async function requireDatabaseConnection(): Promise<void> {
  const result = await validateDatabaseConnection();

  if (!result.isConnected) {
    throw new Error(
      `❌ Database connection failed: ${result.error}\n\n` +
        `Make sure DATABASE_URL is configured in .env.local\n` +
        `Example: DATABASE_URL=postgres://user:pass@host/db`
    );
  }

  if (!result.tablesExist) {
    throw new Error(
      `❌ Database tables do not exist.\n\n` +
        `Run the following commands to set up the database:\n` +
        `  1. intelligo migrate   (applies the framework's migration chain)\n` +
        `  2. drizzle-kit migrate (your own tables, if any)`
    );
  }

  console.log("✓ Database connection validated");
}
