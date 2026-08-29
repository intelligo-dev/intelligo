/**
 * Every Playwright spec belongs to a project.
 *
 * Projects select specs by filename pattern (`tests/e2e/app-*.spec.ts`
 * and so on). A spec whose name does not match any of them is not a
 * failing test — it is not a test at all: Playwright reports success
 * having never opened it, and the coverage it was written for silently
 * does not exist.
 *
 * The patterns are read out of playwright.config.ts rather than
 * restated here, so adding a project cannot make this check stale.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ROOT, hasPlaywrightSuite } from "./scope";

const E2E_DIR = path.join(ROOT, "tests/e2e");
const CONFIG = path.join(ROOT, "playwright.config.ts");

function projectPatterns(): RegExp[] {
  const config = readFileSync(CONFIG, "utf8");
  const matches = [...config.matchAll(/testMatch:\s*\/(.+?)\/[gimsuy]*,/g)];
  return matches.map((m) => new RegExp(m[1]!));
}

describe.skipIf(!hasPlaywrightSuite)("playwright projects", () => {
  it("reads the patterns out of the config", () => {
    // A parse that silently found nothing would make the check below
    // pass for every possible filename.
    expect(projectPatterns().length).toBeGreaterThan(1);
  });

  it("every spec file is selected by a project", () => {
    const patterns = projectPatterns();

    const orphans = readdirSync(E2E_DIR)
      .filter((f) => f.endsWith(".spec.ts"))
      // Patterns are written against the repo-relative path.
      .map((f) => `tests/e2e/${f}`)
      .filter((relative) => !patterns.some((p) => p.test(relative)));

    expect(
      orphans,
      `these specs match no Playwright project and never run:\n  ${orphans.join("\n  ")}`
    ).toEqual([]);
  });
});
