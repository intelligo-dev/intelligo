/**
 * Template catalogue integrity.
 *
 * A template that references a missing file, or ships an import a
 * consumer cannot resolve, fails at `intelligo add` time in someone
 * else's repository — the worst place to discover it. These checks are
 * cheap and catch exactly that.
 *
 * They deliberately do not type-check the templates: the generated
 * code references `@/lib/intelligo`, which only exists once the
 * scaffold has been applied to a real app. The reference application
 * is what proves the generated shapes compile.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { readCatalogue } from "./commands/add";

const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");

/** The `@intelligo-dev/*` names a consumer can resolve: what this repository publishes. */
const PUBLISHED = new Set(
  readdirSync(path.resolve(__dirname, "..", ".."))
    .filter((name) =>
      existsSync(path.resolve(__dirname, "..", "..", name, "package.json"))
    )
    .map((name) => `@intelligo-dev/${name}`)
);
const catalogue = readCatalogue(TEMPLATES_DIR);
const features = Object.keys(catalogue);

describe("template catalogue", () => {
  it("is not empty", () => {
    expect(features.length).toBeGreaterThan(0);
  });

  describe.each(features)("%s", (feature) => {
    const spec = catalogue[feature]!;

    it("declares a version and a description", () => {
      expect(spec.templateVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(spec.description.length).toBeGreaterThan(10);
    });

    it("every template file exists", () => {
      for (const file of spec.files) {
        expect(
          existsSync(path.join(TEMPLATES_DIR, file.template)),
          `${feature}: missing template ${file.template}`
        ).toBe(true);
      }
    });

    it("writes to relative paths inside the app", () => {
      for (const file of spec.files) {
        expect(path.isAbsolute(file.target)).toBe(false);
        // Traversal is a `..` PATH SEGMENT, not the substring: a
        // Next.js catch-all segment (`[...all]`) contains `..` and is
        // a perfectly ordinary target.
        expect(
          file.target.split("/").includes(".."),
          `${feature}: ${file.target} escapes the app root`
        ).toBe(false);
      }
    });

    it("imports only packages this repository publishes", () => {
      // Generated code lands in a consumer repository that installs
      // from npm — an `@intelligo-dev/*` name that is not published
      // would be unresolvable there and is a boundary leak here
      // (ADR-0006).
      expect(PUBLISHED.size).toBeGreaterThan(5);
      for (const file of spec.files) {
        const body = readFileSync(
          path.join(TEMPLATES_DIR, file.template),
          "utf8"
        );
        const unresolvable = [
          ...body.matchAll(/["'](@intelligo-dev\/[a-z-]+)(?:\/[^"']*)?["']/g),
        ]
          .map((m) => m[1]!)
          .filter((name) => !PUBLISHED.has(name));
        expect(
          unresolvable,
          `${file.template} imports unpublished packages`
        ).toEqual([]);
      }
    });
  });

  it("no two features write to the same path", () => {
    // Two features claiming one file would make `add` order-dependent
    // and the manifest ambiguous about which template owns it.
    const seen = new Map<string, string>();
    for (const [feature, spec] of Object.entries(catalogue)) {
      for (const file of spec.files) {
        const other = seen.get(file.target);
        expect(other, `${feature} and ${other} both write ${file.target}`).toBe(
          undefined
        );
        seen.set(file.target, feature);
      }
    }
  });
});
