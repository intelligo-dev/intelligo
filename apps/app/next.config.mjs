// Monorepo env fallback: Next only loads env files from this app's own
// directory, but in this workspace the shared secrets live in the
// repository root's .env (the db:* scripts already treat root as the
// default). Load root .env/.env.local here WITHOUT overriding anything
// the app's own env files or the shell already set.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of ["../../.env.local", "../../.env"]) {
  try {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No root env file — fine; the app's own env or the shell provides it.
  }
}

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@intelligo-dev/admin",
    "@intelligo-dev/audit",
    "@intelligo-dev/auth",
    "@intelligo-dev/billing",
    "@intelligo-dev/billing-core",
    "@intelligo-dev/core",
    "@intelligo-dev/executions",
    "@intelligo-dev/jobs",
    "@intelligo-dev/next",
    "@intelligo-dev/ui",
  ],
};

export default withNextIntl(nextConfig);
