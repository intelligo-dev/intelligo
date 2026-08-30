/**
 * Database Connection Check Script
 * Tests database connection, checks tables, and reports status
 */

import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// A published @intelligo-dev/core cannot assume where the consumer keeps
// its env file, so the default is the repository root and anything
// else is INTELLIGO_ENV_FILE.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath =
  process.env.INTELLIGO_ENV_FILE ?? resolve(__dirname, "../../../.env");
config({ path: envPath });

// Create db connection after env is loaded
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(`❌ DATABASE_URL not found in ${envPath}`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const db = drizzle(sql);

async function checkDatabase() {
  console.log("Testing database connection...");
  console.log("DATABASE_URL:", DATABASE_URL?.replace(/:[^:@]+@/, ":***@")); // Hide password

  try {
    // Test connection
    console.log("\n1. Testing connection...");
    await sql`SELECT 1 as test`;
    console.log("✓ Connection successful");

    // Check current database
    console.log("\n2. Checking database...");
    const dbResult = await sql`SELECT current_database()`;
    console.log("✓ Current database:", dbResult[0]?.current_database);

    // Check if tables exist
    console.log("\n3. Checking auth tables...");
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'accounts', 'verifications')
      ORDER BY table_name
    `;

    const tableNames = tables.map((t: any) => t.table_name);
    console.log("✓ Found tables:", tableNames);

    if (tableNames.length === 0) {
      console.log("\n⚠ No auth tables found.");
      console.log("Fix: intelligo migrate");
      process.exit(1);
    } else if (tableNames.length < 4) {
      const missing = ["users", "sessions", "accounts", "verifications"].filter(
        (t) => !tableNames.includes(t)
      );
      console.log(`\n⚠ Only ${tableNames.length}/4 auth tables found.`);
      console.log("Missing:", missing);
      console.log("Fix: intelligo migrate");
      process.exit(1);
    } else {
      console.log("\n✓ All auth tables exist!");

      // Check user count
      const userCount = await sql`SELECT COUNT(*) as count FROM users`;
      const count = userCount[0]?.count || 0;
      console.log(`✓ Users in database: ${count}`);

      if (count === 0 || count === "0") {
        console.log("\n💡 No users yet. Create admin user:");
        console.log("   pnpm --filter @intelligo-dev/core db:seed");
      }
    }

    console.log("\n✅ Database is ready!");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Database check failed:");
    console.error(error.message);
    console.error("\nPossible fixes:");
    console.error(`1. Check DATABASE_URL in ${envPath}`);
    console.error("2. Ensure PostgreSQL is running on localhost:5444");
    console.error("3. Create database if needed:");
    console.error("   docker run --name postgres-intelligo \\");
    console.error("     -e POSTGRES_PASSWORD=postgres \\");
    console.error("     -e POSTGRES_DB=intelligo \\");
    console.error("     -p 5444:5432 -d postgres:17");
    process.exit(1);
  }
}

checkDatabase();
