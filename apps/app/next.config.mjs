import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import createNextIntlPlugin from "next-intl/plugin";

// Next reads env files from this directory only. When `intelligo create`
// made this app as a member of a pnpm workspace, the workspace root's
// .env.local and .env fill in what neither they nor the shell set — the
// files `intelligo doctor` and `intelligo migrate` read there too. Null
// for an app outside any workspace.
const WORKSPACE_ROOT = "../..";

if (WORKSPACE_ROOT) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), WORKSPACE_ROOT);
  for (const file of [".env.local", ".env"]) {
    let content;
    try {
      content = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parseEnv(content))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inside the framework's own workspace these packages resolve to
  // TypeScript source; from npm they are compiled JavaScript, which this
  // leaves as it is.
  transpilePackages: [
    "@intelligo-dev/admin",
    "@intelligo-dev/audit",
    "@intelligo-dev/auth",
    "@intelligo-dev/billing",
    "@intelligo-dev/chat",
    "@intelligo-dev/core",
    "@intelligo-dev/executions",
    "@intelligo-dev/jobs",
    "@intelligo-dev/next",
  ],
  // Sent on every response. No page may be framed by another site (the
  // settings pages delete and transfer things a click away), browsers
  // keep to HTTPS and to the declared content types, and a link out
  // carries only the origin. A Content-Security-Policy is yours to add.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
