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
};

export default withNextIntl(nextConfig);
