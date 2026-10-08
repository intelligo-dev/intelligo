/**
 * Seams the browser bundles, checked for what must not reach it. A seam
 * is the deployment's own file, and nothing in it says that a client
 * component imports it: a server import there fails the build with an
 * error about a module the developer never named, and a secret read
 * there ships in the page.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { CheckResult } from "./doctor.js";

/**
 * Framework modules a client bundle may import: dependency-free leaves
 * and the client entry points. Every other `@intelligo-dev/*` module
 * reaches the database or a server SDK. The architecture suite holds
 * this list to the leaves it asserts and every package's `./client`.
 */
export const CLIENT_SAFE_MODULES: ReadonlySet<string> = new Set([
  "@intelligo-dev/auth/client",
  "@intelligo-dev/chat/client",
  "@intelligo-dev/core/money",
  "@intelligo-dev/core/registry",
  "@intelligo-dev/core/prompt",
  "@intelligo-dev/core/request-context",
  "@intelligo-dev/executions/pricing",
  "@intelligo-dev/billing/plans",
  "@intelligo-dev/billing/plan-registry",
  "@intelligo-dev/billing/payment",
  "@intelligo-dev/billing/quota-types",
]);

const NODE_BUILTINS = new Set([
  "fs",
  "path",
  "crypto",
  "child_process",
  "os",
  "net",
  "tls",
  "http",
  "https",
  "stream",
  "zlib",
]);

/** What a client seam's source imports or reads that the browser cannot have. */
export function serverReach(source: string): string[] {
  const found = new Set<string>();
  const imports =
    /^\s*(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(imports)) {
    if (match[1]) continue;
    const specifier = match[2]!;
    if (
      specifier === "server-only" ||
      specifier.startsWith("node:") ||
      NODE_BUILTINS.has(specifier) ||
      (specifier.startsWith("@intelligo-dev/") &&
        !CLIENT_SAFE_MODULES.has(specifier))
    ) {
      found.add(specifier);
    }
  }
  for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    const name = match[1]!;
    if (!name.startsWith("NEXT_PUBLIC_") && name !== "NODE_ENV") {
      found.add(`process.env.${name}`);
    }
  }
  return [...found];
}

export function checkSeamBoundaries(
  root: string,
  boundaries: Record<string, string> | undefined
): CheckResult[] {
  const results: CheckResult[] = [];
  for (const [seam, boundary] of Object.entries(boundaries ?? {})) {
    if (boundary !== "client") continue;
    const abs = path.join(root, seam);
    if (!existsSync(abs)) continue;
    const reach = serverReach(readFileSync(abs, "utf8"));
    if (reach.length === 0) continue;
    results.push({
      name: `seam:${seam}`,
      status: "warn",
      detail: `the browser bundles this seam, and it uses ${reach.join(", ")} — move that behind a server action or a route`,
    });
  }
  return results;
}
