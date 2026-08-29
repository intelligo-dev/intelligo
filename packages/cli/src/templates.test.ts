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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readCatalogue } from "./commands/add";

const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");
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
        expect(
          file.target.includes(".."),
          `${feature}: ${file.target} escapes the app root`
        ).toBe(false);
      }
    });

    it("imports only public packages", () => {
      // Generated code lands in a consumer repository that has no
      // access to private/ — an import of one would be unresolvable
      // there and is a boundary leak here (ADR-0006).
      //
      // public-export-audit: allow-private-names — this file names them
      // in order to assert their absence.
      for (const file of spec.files) {
        const body = readFileSync(
          path.join(TEMPLATES_DIR, file.template),
          "utf8"
        );
        expect(body).not.toContain("@example/product");
        expect(body).not.toContain("@example/product");
        expect(body).not.toContain("private/");
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
