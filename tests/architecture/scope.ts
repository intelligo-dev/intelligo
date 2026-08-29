import { existsSync } from "node:fs";
import path from "node:path";

/**
 * What exists in the tree these rules are running against.
 *
 * The architecture tests are copied into the extracted public
 * foundation, which by construction has no `private/` workspace, no
 * Acme application and no Playwright suite (ADR-0001). A rule about
 * something absent is not a failing rule — there is nothing to rule on.
 *
 * This module exists because that lesson arrived four separate times,
 * once per rule, each as a red build in the extracted tree. Declaring
 * scope from one place makes the convention visible to whoever writes
 * the fifth rule.
 *
 * These are deliberately not "skip if the file is missing" checks
 * inside each assertion: a rule that quietly passes when its subject
 * disappears is how a test stops testing. The skip is at the describe
 * level, and every scoped suite keeps a non-vacuity assertion for the
 * tree where its subject does exist.
 */

export const ROOT = path.resolve(__dirname, "../..");

/** The private workspace: `product/app`, `product/app`, and so on. */
export const hasPrivateWorkspace = existsSync(path.join(ROOT, "private"));

/** The Acme product application specifically. */
export const hasIgniteApp = existsSync(path.join(ROOT, "product/app"));

/** The Playwright suite, which exercises Acme rather than the foundation. */
export const hasPlaywrightSuite =
  existsSync(path.join(ROOT, "playwright.config.ts")) &&
  existsSync(path.join(ROOT, "tests/e2e"));

/** The extraction tooling, which only the incubation repository carries. */
export const hasExtractionScript = existsSync(
  path.join(ROOT, "scripts/extract-public.ts")
);

/** The shadcn-compatible page registry (Phase 1 of the registry migration). */
export const hasRegistry = existsSync(
  path.join(ROOT, "registry/registry.json")
);
