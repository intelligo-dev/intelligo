import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

const sql = neon(process.env.DATABASE_URL!);

async function checkBillingTables() {
  console.log("Checking billing tables...\n");

  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  console.log("All tables in database:");
  tables.forEach((t) => console.log("  -", t.tablename));

  const billingTables = [
    "plans",
    "subscriptions",
    "credit_balances",
    "credit_purchases",
    "finance_events",
  ];

  console.log("\nBilling tables check:");
  const found = billingTables.filter((t) =>
    tables.some((row) => row.tablename === t)
  );

  found.forEach((t) => console.log("  ✓", t));

  const missing = billingTables.filter((t) => !found.includes(t));
  if (missing.length > 0) {
    console.log("\n  ✗ Missing:", missing.join(", "));
    process.exit(1);
  }

  console.log(`\n✅ All ${billingTables.length} billing tables exist!`);
}

checkBillingTables();
