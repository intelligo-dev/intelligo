/**
 * Every database-backed suite runs in CI.
 *
 * An integration suite gates on a database URL and skips without one,
 * and the unit run empties it, so a suite runs only where a CI step
 * names it, by file or by a directory that holds it. One that no step
 * names is skipped on every run and stays green whatever it would say.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { APPS_DIR, PACKAGES_DIR, ROOT, walk } from "./tree";

const INTEGRATION = /\.(int|integration)\.test\.tsx?$/;

const suites = [PACKAGES_DIR, APPS_DIR]
  .flatMap((dir) => walk(dir, (name) => INTEGRATION.test(name)))
  .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
  .sort();

/** The paths the workflow passes to `vitest run`, as files or directories. */
function namedPaths(workflow: string): string[] {
  const paths: string[] = [];
  for (const [, command] of workflow.matchAll(
    /vitest run((?:[^\n]*\\\n)*[^\n]*)/g
  )) {
    for (const token of command!.split(/[\s\\]+/)) {
      if (/^(packages|apps|tools|tests)\//.test(token))
        paths.push(token.replace(/\/$/, ""));
    }
  }
  return paths;
}

describe("integration suites in CI", () => {
  const named = namedPaths(
    readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8")
  );

  it("finds the suites and the steps", () => {
    expect(suites.length).toBeGreaterThan(10);
    expect(named.length).toBeGreaterThan(5);
  });

  it("every integration suite is named by a CI step", () => {
    const unnamed = suites.filter(
      (file) => !named.some((p) => file === p || file.startsWith(`${p}/`))
    );
    expect(
      unnamed,
      `integration suites no CI step runs; add each to the step whose database it needs:\n  ${unnamed.join("\n  ")}`
    ).toEqual([]);
  });

  it("every suite file a step names exists", () => {
    const missing = named.filter(
      (p) => INTEGRATION.test(p) && !suites.includes(p)
    );
    expect(missing).toEqual([]);
  });
});
