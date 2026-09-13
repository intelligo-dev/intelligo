/**
 * Registry structural and boundary rules (Phase 1 of the page/registry
 * migration — docs/intelligo-page-registry-migration-plan.md §3-4).
 *
 * The registry (`packages/registry/`, a private workspace) ships
 * shadcn-compatible page/component
 * source that becomes ordinary consumer-owned source once installed.
 * Nothing in it may import a package this repository does not publish,
 * a dissolved package, or `@intelligo-dev/ui` (a duplicate runtime
 * dependency), and every file it ships must actually be wired into an
 * item.
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

import {
  DISSOLVED_PACKAGES,
  PACKAGES_DIR,
  ROOT,
  listPublishedWorkspaces,
} from "./tree";

const REGISTRY_DIR = path.join(PACKAGES_DIR, "registry");
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

/**
 * Design-system items (ADR-0013) configure an app — config, tokens, CSS —
 * and ship no files, pages or messages. Every per-item rule below is
 * about blocks; the base item has its own describe.
 */
const DESIGN_SYSTEM_TYPES = new Set([
  "registry:base",
  "registry:style",
  "registry:theme",
]);

function readBlocks(): RegistryJson {
  const registry = readRegistry();
  return {
    ...registry,
    items: registry.items.filter((item) => !DESIGN_SYSTEM_TYPES.has(item.type)),
  };
}

type Requires = {
  scaffold: string[];
  items: Record<
    string,
    {
      marker: string;
      items?: string[];
      files?: string[];
      exports?: Record<string, string[]>;
      features?: string[];
    }
  >;
};

function readRequires(): Requires {
  return JSON.parse(
    readFileSync(path.join(REGISTRY_DIR, "requires.json"), "utf8")
  ) as Requires;
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

describe("registry", () => {
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
        if (DESIGN_SYSTEM_TYPES.has(item.type)) continue;
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

  describe("the intelligo design-system base (ADR-0013)", () => {
    const registry = readRegistry();
    const bases = registry.items.filter(
      (item) => item.type === "registry:base"
    );
    const base = bases[0] as
      | (RegistryItem & {
          config?: { style?: string; iconLibrary?: string };
          cssVars?: Record<"theme" | "light" | "dark", Record<string, string>>;
        })
      | undefined;

    it("is the one registry:base item, named intelligo, on base-nova", () => {
      expect(bases.map((item) => item.name)).toEqual(["intelligo"]);
      expect(base?.config?.style).toBe("base-nova");
      expect(base?.config?.iconLibrary).toBe("lucide");
    });

    it("defines every additive token in light and dark, and maps each colour into the theme", () => {
      const additive = [
        "destructive-foreground",
        "success",
        "success-foreground",
        "warning",
        "warning-foreground",
        "info",
        "info-foreground",
      ];
      const missing: string[] = [];
      for (const token of additive) {
        for (const mode of ["light", "dark"] as const) {
          if (!base?.cssVars?.[mode]?.[token])
            missing.push(`${mode}: --${token}`);
        }
        if (base?.cssVars?.theme?.[`color-${token}`] !== `var(--${token})`) {
          missing.push(`theme: --color-${token}`);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe("registry files on disk", () => {
    const registry = readBlocks();

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

  describe("no unpublished, dissolved or duplicate-runtime imports", () => {
    const registry = readBlocks();
    const dissolved: readonly string[] = DISSOLVED_PACKAGES;
    /** The only `@intelligo-dev/*` names a consumer can resolve from npm. */
    const published = new Set(
      listPublishedWorkspaces(PACKAGES_DIR).map(
        (pkg) => `@intelligo-dev/${pkg}`
      )
    );

    it("has a dissolved set and a published set to rule on", () => {
      expect(dissolved.length).toBeGreaterThan(0);
      expect(published.size).toBeGreaterThan(5);
    });

    describe.each(registry.items)("item: $name", (item) => {
      const itemRoot = path.join(BASE_DIR, item.name);

      it("imports no unpublished, dissolved, or @intelligo-dev/ui path", () => {
        const violations: string[] = [];

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          const rel = path.relative(ROOT, abs);

          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith("@intelligo-dev/")) continue;
            const dep = spec.split("/").slice(0, 2).join("/");
            if (dissolved.includes(dep)) {
              violations.push(`${rel} → ${spec} (dissolved package, ADR-0008)`);
            } else if (dep === "@intelligo-dev/ui") {
              violations.push(
                `${rel} → ${spec} (registry items use consumer @/components/ui/*, not @intelligo-dev/ui)`
              );
            } else if (!published.has(dep)) {
              violations.push(
                `${rel} → ${spec} (not a package this repository publishes)`
              );
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

  describe("@intelligo-dev/* imports are declared in the item's dependencies", () => {
    const registry = readBlocks();

    describe.each(registry.items)("item: $name", (item) => {
      it("declares every @intelligo-dev/* package it imports", () => {
        const declared = new Set(item.dependencies ?? []);
        const undeclared = new Set<string>();

        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";

          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith("@intelligo-dev/")) continue;
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
    const registry = readBlocks();

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
            if (spec.startsWith("@intelligo-dev/")) continue; // covered above
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
    const registry = readBlocks();

    // Consumer files the CLI app scaffold provides (not any registry
    // item, on purpose) — declared once in registry/requires.json.
    const SCAFFOLD_PROVIDED = new Set(readRequires().scaffold);

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

  /**
   * registry/requires.json is the machine-readable form of what the
   * descriptions used to say in prose: which sibling items an item
   * needs installed first, which scaffold files it imports, and which
   * feature keys it gates on. CI derives the install order from it and
   * `intelligo doctor` checks an app against it, so it must be exactly
   * what the code does — neither a stale extra nor a missing edge.
   */
  describe("requires.json matches the code", () => {
    const registry = readBlocks();
    const requires = readRequires();

    const ownerOf = new Map<string, string>();
    for (const item of registry.items) {
      for (const file of item.files) {
        if (typeof file.target === "string") {
          ownerOf.set(file.target.replace(/\.(tsx?|json)$/, ""), item.name);
        }
      }
    }

    it("lists every item, and only items that exist", () => {
      expect(Object.keys(requires.items).sort()).toEqual(
        registry.items.map((i) => i.name).sort()
      );
    });

    it("is what the CLI ships to doctor, byte for byte", () => {
      // The copy is regenerated by the CLI build and committed; a
      // stale one means requires.json changed without a build.
      expect(
        readFileSync(
          path.join(ROOT, "packages/cli/templates/registry-requires.json"),
          "utf8"
        ),
        "packages/cli/templates/registry-requires.json is stale — run `pnpm --filter @intelligo-dev/cli build`"
      ).toBe(readFileSync(path.join(REGISTRY_DIR, "requires.json"), "utf8"));
    });

    describe.each(registry.items)("item: $name", (item) => {
      const entry = requires.items[item.name]!;

      it("declares exactly the sibling items and scaffold files it imports", () => {
        const items = new Set<string>();
        const files = new Set<string>();
        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          for (const spec of importSpecifiers(source)) {
            if (!spec.startsWith("@/")) continue;
            const target = spec.slice(2);
            if (target.startsWith("components/ui/")) continue;
            const owner = ownerOf.get(target);
            if (owner && owner !== item.name) items.add(owner);
            else if (!owner) files.add(target);
          }
        }
        expect(entry.items ?? []).toEqual([...items].sort());
        expect(entry.files ?? []).toEqual([...files].sort());
      });

      it("declares exactly the feature keys it gates on", () => {
        const features = new Set<string>();
        for (const file of item.files) {
          const abs = path.join(REGISTRY_DIR, file.path);
          const source = statSyncSafe(abs) ? readFileSync(abs, "utf8") : "";
          for (const m of source.matchAll(/featureKey:\s*["']([^"']+)["']/g)) {
            features.add(m[1]!);
          }
        }
        expect(entry.features ?? []).toEqual([...features].sort());
      });

      it("marks itself by a file it actually ships", () => {
        expect(
          item.files.some((f) => f.target === entry.marker),
          `${item.name}: marker ${entry.marker} is not one of its targets`
        ).toBe(true);
      });
    });

    it("has no dependency cycles, so an install order exists", () => {
      const visiting = new Set<string>();
      const done = new Set<string>();
      const visit = (name: string, trail: string[]) => {
        if (done.has(name)) return;
        if (visiting.has(name)) {
          throw new Error(`cycle: ${[...trail, name].join(" → ")}`);
        }
        visiting.add(name);
        for (const dep of requires.items[name]?.items ?? []) {
          visit(dep, [...trail, name]);
        }
        visiting.delete(name);
        done.add(name);
      };
      for (const name of Object.keys(requires.items)) visit(name, []);
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
    const registry = readBlocks();

    // `formatPrice` (@intelligo-dev/billing/plans) hardcodes the tugrik
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
    const registry = readBlocks();

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

/**
 * The registry is a workspace so the toolchain owns it, not so anything
 * can depend on it. Its manifest is private, declares no runtime
 * dependencies, and carries as devDependencies every package an item
 * imports — that is what lets `tsc` check the items in place.
 */
describe("the registry workspace", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(REGISTRY_DIR, "package.json"), "utf8")
  ) as {
    private?: boolean;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it("is private and has no runtime dependencies", () => {
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies).toBeUndefined();
  });

  it("can resolve every package its items import", () => {
    // `zod@^3.25.76` pins a version; compare on the name alone.
    const name = (dep: string) => {
      const at = dep.lastIndexOf("@");
      return at > 0 ? dep.slice(0, at) : dep;
    };
    // Implicit for a Next app; declared here so tsc finds them.
    const needed = new Set(["react", "react-dom", "next"]);
    for (const item of readBlocks().items) {
      for (const dep of item.dependencies ?? []) needed.add(name(dep));
    }
    const missing = [...needed].filter(
      (name) => !(manifest.devDependencies ?? {})[name]
    );
    expect(
      missing,
      `packages/registry/package.json lacks devDependencies its items import: ${missing.join(", ")}`
    ).toEqual([]);
  });
});
