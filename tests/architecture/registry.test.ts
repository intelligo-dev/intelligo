/**
 * Registry structural and boundary rules (Phase 1 of the page/registry
 * migration — docs/intelligo-page-registry-migration-plan.md §3-4).
 *
 * The registry (`registry/`) ships shadcn-compatible page/component
 * source that becomes ordinary consumer-owned source once installed.
 * Nothing in it may leak a private import, a dissolved-package import,
 * or a duplicate `@intelligo/ui` runtime dependency, and every file it
 * ships must actually be wired into an item.
 *
 * Schema check: the official schema lives at
 * https://ui.shadcn.com/schema/registry.json and
 * https://ui.shadcn.com/schema/registry-item.json. This suite
 * validates the same shape locally, by hand, without a network call
 * and without a `zod` dependency — `zod` is not resolvable from the
 * repo root under pnpm's strict node-linker (only packages that
 * declare it get a symlink), and this suite's HARD RULE is no
 * `pnpm install`. A hand-rolled structural check is the deviation;
 * see the migration plan/report for the full note.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { ROOT, hasRegistry } from "./scope";

const REGISTRY_DIR = path.join(ROOT, "registry");
const BASE_DIR = path.join(REGISTRY_DIR, "base");
const REGISTRY_JSON_PATH = path.join(REGISTRY_DIR, "registry.json");

const VALID_FILE_TYPES = [
  "registry:page",
  "registry:component",
  "registry:file",
  "registry:lib",
  "registry:hook",
] as const;

const TYPES_REQUIRING_TARGET = new Set(["registry:page", "registry:file"]);

interface RegistryFile {
  path: string;
  type: string;
  target?: string;
}

interface RegistryItem {
  name: string;
  type: string;
  files: RegistryFile[];
  dependencies?: string[];
  registryDependencies?: string[];
}

interface RegistryJson {
  $schema?: string;
  name: string;
  homepage?: string;
  items: RegistryItem[];
}

function readRegistry(): RegistryJson {
  return JSON.parse(readFileSync(REGISTRY_JSON_PATH, "utf8")) as RegistryJson;
}

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
]);

function walkFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Extract module specifiers from static + dynamic imports and requires. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
    /\brequire\s*\(\s*[`"']([^`"']+)[`"']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]!);
  }
  return specs;
}

describe.skipIf(!hasRegistry)("registry", () => {
  it("has a registry.json to rule on", () => {
    // A silent empty item list would make every assertion below vacuous.
    const registry = readRegistry();
    expect(registry.items.length).toBeGreaterThan(0);
  });

  describe("registry.json structural shape", () => {
    const registry = readRegistry();

    it("declares the required top-level fields", () => {
      expect(registry.$schema).toBe(
        "https://ui.shadcn.com/schema/registry.json"
      );
      expect(typeof registry.name).toBe("string");
      expect(registry.name.length).toBeGreaterThan(0);
      expect(Array.isArray(registry.items)).toBe(true);
    });

    it("gives every item a name, type and non-empty files array", () => {
      const violations: string[] = [];
      for (const item of registry.items) {
        if (!item.name) violations.push("item missing name");
        if (!item.type) violations.push(`${item.name}: missing type`);
        if (!Array.isArray(item.files) || item.files.length === 0) {
          violations.push(`${item.name}: missing or empty files[]`);
        }
      }
      expect(violations).toEqual([]);
    });

    it("uses only valid file types, and requires target on page/file entries", () => {
      const violations: string[] = [];
      for (const item of registry.items) {
        for (const file of item.files ?? []) {
          if (!VALID_FILE_TYPES.includes(file.type as never)) {
            violations.push(
              `${item.name}: ${file.path} has invalid type "${file.type}"`
            );
          }
          if (TYPES_REQUIRING_TARGET.has(file.type) && !file.target) {
            violations.push(
              `${item.name}: ${file.path} (${file.type}) is missing target`
            );
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe("registry files on disk", () => {
    const registry = readRegistry();

    it("has every listed file path present on disk", () => {
      const violations: string[] = [];
      for (const item of registry.items) {
        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          if (!statSyncSafe(abs)) {
            violations.push(`${item.name}: ${file.path} does not exist`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it("has no file under registry/base/** left unreferenced by any item", () => {
      const declared = new Set(
        registry.items.flatMap((item) =>
          item.files.map((file) =>
            path.relative(REGISTRY_DIR, path.join(REGISTRY_DIR, file.path))
          )
        )
      );

      const onDisk = walkFiles(BASE_DIR).map((abs) =>
        path.relative(REGISTRY_DIR, abs)
      );

      const orphans = onDisk.filter((rel) => !declared.has(rel));
      expect(
        orphans,
        `orphan files not referenced by any item:\n  ${orphans.join("\n  ")}`
      ).toEqual([]);
    });

    it("references each file from exactly one item", () => {
      const counts = new Map<string, string[]>();
      for (const item of registry.items) {
        for (const file of item.files) {
          const rel = path.relative(
            REGISTRY_DIR,
            path.join(REGISTRY_DIR, file.path)
          );
          counts.set(rel, [...(counts.get(rel) ?? []), item.name]);
        }
      }

      const duplicates = [...counts.entries()].filter(
        ([, owners]) => owners.length > 1
      );
      expect(
        duplicates,
        `files referenced by more than one item:\n  ${duplicates
          .map(([file, owners]) => `${file} → ${owners.join(", ")}`)
          .join("\n  ")}`
      ).toEqual([]);
    });
  });

  describe("no private or duplicate-runtime imports", () => {
    const registry = readRegistry();
    const allowlist = JSON.parse(
      readFileSync(path.join(ROOT, "config/public-packages.json"), "utf8")
    ) as { deprecated: string[] };
    const dissolved = allowlist.deprecated.map((p) => `@intelligo/${p}`);

    it("has a dissolved set to rule on", () => {
      expect(dissolved.length).toBeGreaterThan(0);
    });

    describe.each(registry.items)("item: $name", (item) => {
      const itemRoot = path.join(BASE_DIR, item.name);

      it("imports no private, dissolved, or @intelligo/ui path", () => {
        const violations: string[] = [];

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          const rel = path.relative(ROOT, abs);

          for (const spec of importSpecifiers(source)) {
            if (spec.includes("private/")) {
              violations.push(`${rel} → ${spec} (private path)`);
              continue;
            }
            if (
              spec === "@intelligo/acme" ||
              spec.startsWith("@intelligo/acme/")
            ) {
              violations.push(`${rel} → ${spec} (private app)`);
              continue;
            }
            if (
              spec === "@intelligo/support" ||
              spec.startsWith("@intelligo/support/")
            ) {
              violations.push(`${rel} → ${spec} (private vertical)`);
              continue;
            }
            if (spec === "@intelligo/ui" || spec.startsWith("@intelligo/ui/")) {
              violations.push(
                `${rel} → ${spec} (registry items use consumer @/components/ui/*, not @intelligo/ui)`
              );
              continue;
            }
            if (spec.startsWith("@intelligo/")) {
              const dep = spec.split("/").slice(0, 2).join("/");
              if (dissolved.includes(dep)) {
                violations.push(`${rel} → ${spec} (dissolved package)`);
              }
            }
          }
        }

        expect(violations).toEqual([]);
      });

      it("keeps relative imports inside the item's own directory", () => {
        const violations: string[] = [];

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          const rel = path.relative(ROOT, abs);

          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith(".")) continue;
            const resolved = path.resolve(path.dirname(abs), spec);
            if (
              resolved !== itemRoot &&
              !resolved.startsWith(itemRoot + path.sep)
            ) {
              violations.push(`${rel} → ${spec} (escapes item root)`);
            }
          }
        }

        expect(violations).toEqual([]);
      });
    });
  });

  describe("@intelligo/* imports are declared in the item's dependencies", () => {
    const registry = readRegistry();

    describe.each(registry.items)("item: $name", (item) => {
      it("declares every @intelligo/* package it imports", () => {
        const declared = new Set(item.dependencies ?? []);
        const undeclared = new Set<string>();

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";

          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith("@intelligo/")) continue;
            const dep = spec.split("/").slice(0, 2).join("/");
            if (!declared.has(dep)) undeclared.add(dep);
          }
        }

        expect(
          [...undeclared],
          `item "${item.name}" imports @intelligo packages it does not declare in dependencies: ${[...undeclared].join(", ")}`
        ).toEqual([]);
      });
    });
  });

  describe("npm imports are declared in the item's dependencies", () => {
    const registry = readRegistry();

    // Provided by every Next.js consumer app; declaring them per item
    // would be noise, and shadcn would try to (re)install them.
    const IMPLICIT_NPM = new Set(["react", "react-dom", "next"]);

    /** "lucide-react" → "lucide-react"; "@ai-sdk/react" → "@ai-sdk/react";
     *  "next-intl/server" → "next-intl"; "ai/test" → "ai". */
    function packageName(spec: string): string {
      const parts = spec.split("/");
      return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    }

    /**
     * shadcn's `dependencies` accept an optional version specifier
     * (`zod@^3.25.76`), which is how an item pins a package whose next
     * major would break it. Compare on the package name alone.
     */
    function declaredName(dependency: string): string {
      const at = dependency.lastIndexOf("@");
      return at > 0 ? dependency.slice(0, at) : dependency;
    }

    describe.each(registry.items)("item: $name", (item) => {
      it("declares every npm package it imports", () => {
        const declared = new Set((item.dependencies ?? []).map(declaredName));
        const undeclared = new Set<string>();

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";

          for (const spec of importSpecifiers(source)) {
            if (spec.startsWith(".") || spec.startsWith("@/")) continue;
            if (spec.startsWith("@intelligo/")) continue; // covered above
            if (spec.startsWith("node:")) continue;
            const pkg = packageName(spec);
            if (IMPLICIT_NPM.has(pkg)) continue;
            if (!declared.has(pkg)) undeclared.add(pkg);
          }
        }

        expect(
          [...undeclared],
          `item "${item.name}" imports npm packages it does not declare in dependencies: ${[...undeclared].join(", ")}`
        ).toEqual([]);
      });
    });
  });

  describe("cross-item @/ imports resolve to a shipped target", () => {
    const registry = readRegistry();

    // Consumer files the CLI app scaffold provides (not any registry
    // item, on purpose): the composition root and its plan catalogue
    // (packages/cli/templates/app-scaffold/{intelligo,plans}.ts.tpl),
    // shadcn's own lib/utils + use-mobile, and next-intl's routing
    // files created by `intelligo create`.
    const SCAFFOLD_PROVIDED = new Set([
      "lib/intelligo",
      "lib/plans",
      "lib/utils",
      "i18n/routing",
      "i18n/navigation",
      "hooks/use-mobile",
    ]);

    // Every target any item ships, extensionless, e.g. "actions/team",
    // "components/team/member-list", "lib/team".
    const shippedTargets = new Set(
      registry.items.flatMap((item) =>
        item.files
          .map((file) => file.target)
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.replace(/\.(tsx?|json)$/, ""))
      )
    );

    describe.each(registry.items)("item: $name", (item) => {
      it("imports @/ paths only from shipped targets, declared ui primitives, or the scaffold", () => {
        const regDeps = new Set(item.registryDependencies ?? []);
        const violations: string[] = [];

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          const rel = path.relative(ROOT, abs);

          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith("@/")) continue;
            const target = spec.slice(2);

            if (SCAFFOLD_PROVIDED.has(target)) continue;

            const uiMatch = target.match(/^components\/ui\/([\w-]+)$/);
            if (uiMatch) {
              if (!regDeps.has(uiMatch[1]!)) {
                violations.push(
                  `${rel} → ${spec} (ui primitive "${uiMatch[1]}" not in registryDependencies)`
                );
              }
              continue;
            }

            if (!shippedTargets.has(target)) {
              violations.push(
                `${rel} → ${spec} (no item ships this target and it is not scaffold-provided)`
              );
            }
          }
        }

        expect(violations).toEqual([]);
      });
    });
  });

  describe("consumer configs reference keys that exist", () => {
    // Config seams carry message keys, never literal copy (ADR-0010) —
    // the failure mode that guards against is a key with no message
    // behind it, which renders as the raw key in production.
    it("resolves every message key the shipped onboarding steps name", () => {
      const configPath = path.join(
        REGISTRY_DIR,
        "base/onboarding/lib/onboarding-steps.ts"
      );
      const messagesPath = path.join(
        REGISTRY_DIR,
        "base/onboarding/messages/en.json"
      );
      if (!statSyncSafe(configPath) || !statSyncSafe(messagesPath)) return;

      const source = readFileSync(configPath, "utf8");
      const messages = JSON.parse(readFileSync(messagesPath, "utf8")) as Record<
        string,
        unknown
      >;

      const keys = [...source.matchAll(/"(onboarding\.[A-Za-z0-9_.]+)"/g)].map(
        (match) => match[1]!
      );

      expect(keys.length).toBeGreaterThan(0);

      const missing = keys.filter((key) => {
        // The item's own namespace is the file's top level, so the
        // leading "onboarding." segment is stripped before lookup.
        const parts = key.split(".").slice(1);
        let node: unknown = messages;
        for (const part of parts) {
          if (typeof node !== "object" || node === null) return true;
          node = (node as Record<string, unknown>)[part];
        }
        return typeof node !== "string";
      });

      expect(
        missing,
        `onboarding-steps.ts names message keys with no message behind them:\n  ${missing.join("\n  ")}`
      ).toEqual([]);
    });
  });

  describe("money is formatted per deployment, not per package", () => {
    const registry = readRegistry();

    // `formatPrice` (@intelligo/billing/plans) hardcodes the tugrik
    // symbol and the Mongolian word for "free". Installed pages format
    // money through next-intl against `CURRENCY` in the consumer's
    // lib/billing-config.ts instead, so one deployment's currency can
    // never leak into another's UI.
    it("never imports the deprecated formatPrice helper", () => {
      const violations: string[] = [];

      for (const item of registry.items) {
        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          if (!statSyncSafe(abs)) continue;
          const source = readFileSync(abs, "utf8");
          if (/\bformatPrice\b/.test(source)) {
            violations.push(`${item.name}: ${file.path}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("i18n-native items (ADR-0010)", () => {
    const registry = readRegistry();

    describe.each(registry.items)("item: $name", (item) => {
      it("ships messages/en/<item>.json", () => {
        const target = `messages/en/${item.name}.json`;
        const shipsMessages = item.files.some((file) => file.target === target);
        expect(
          shipsMessages,
          `item "${item.name}" ships no ${target} (per-item next-intl namespace)`
        ).toBe(true);
      });
    });
  });
});

function statSyncSafe(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
