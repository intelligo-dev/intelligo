import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import createNextIntlPlugin from "next-intl/plugin";

// Next reads env files from this directory only. When the app sits
// inside a pnpm workspace, the workspace root's .env.local and .env
// fill in what neither they nor the shell set — the same files
// `intelligo doctor` and `intelligo migrate` read there.
function workspaceRoot(from) {
  if (existsSync(join(from, "pnpm-workspace.yaml"))) return null;
  for (let dir = dirname(from); dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
  }
  return null;
}

const root = workspaceRoot(process.cwd());
for (const file of root ? [".env.local", ".env"] : []) {
  let content;
  try {
    content = readFileSync(join(root, file), "utf8");
  } catch {
    continue;
  }
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
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
