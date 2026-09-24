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
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { readCatalogue } from "./commands/add";

const TEMPLATES_DIR = path.resolve(__dirname, "..", "templates");

/** The `@intelligo-dev/*` names a consumer can resolve: what this repository publishes. */
const PUBLISHED = new Set(
  readdirSync(path.resolve(__dirname, "..", ".."))
    .filter((name) => {
      const manifest = path.resolve(
        __dirname,
        "..",
        "..",
        name,
        "package.json"
      );
      if (!existsSync(manifest)) return false;
      // `packages/registry` is a private workspace, not an npm name.
      return (
        (JSON.parse(readFileSync(manifest, "utf8")) as { private?: boolean })
          .private !== true
      );
    })
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
      // would be unresolvable there and is a boundary leak here.
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

  it("the scaffold declares every peer of the packages it depends on", () => {
    // A strict package manager does not install a missing peer, and the
    // failure is an unresolvable import at the consumer's first build.
    const scaffold = JSON.parse(
      readFileSync(
        path.join(TEMPLATES_DIR, "app-scaffold/package.json.tpl"),
        "utf8"
      )
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const missing: string[] = [];
    for (const name of Object.keys(scaffold.dependencies)) {
      if (!name.startsWith("@intelligo-dev/")) continue;
      const manifest = JSON.parse(
        readFileSync(
          path.resolve(
            __dirname,
            "..",
            "..",
            name.slice("@intelligo-dev/".length),
            "package.json"
          ),
          "utf8"
        )
      ) as {
        peerDependencies?: Record<string, string>;
        peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      };
      for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
        if (manifest.peerDependenciesMeta?.[peer]?.optional) continue;
        if (!scaffold.dependencies[peer]) missing.push(`${name} → ${peer}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the scaffold can resolve a Postgres driver for drizzle-kit migrate", () => {
    // drizzle-kit loads `pg` from the app, not from @intelligo-dev/core.
    const scaffold = readFileSync(
      path.join(TEMPLATES_DIR, "app-scaffold/package.json.tpl"),
      "utf8"
    );
    expect(scaffold).toMatch(/"db:migrate": ".*drizzle-kit migrate"/);
    expect(JSON.parse(scaffold).devDependencies.pg).toBeDefined();
  });

  it("the maintenance cron outpaces the route's stale threshold, and the route says so", () => {
    const cron = catalogue.maintenance!.cron!;
    const route = readFileSync(
      path.join(TEMPLATES_DIR, "maintenance/maintenance-route.ts.tpl"),
      "utf8"
    );
    const everyMinutes = Number(cron.schedule.match(/^0-59\/(\d+) /)?.[1]);
    const staleMinutes = Number(
      route.match(/STALE_AFTER_MS = (\d+) \* 60_000/)?.[1]
    );

    expect(everyMinutes).toBeGreaterThan(0);
    expect(everyMinutes).toBeLessThanOrEqual(staleMinutes);
    expect(route).toContain(`\`${cron.schedule}\``);
    expect(route).toContain("Hobby");
    expect(catalogue.maintenance!.description).toContain("five minutes");
  });

  it("the vitest feature aliases server-only to the stub it writes, and inlines the framework", () => {
    const spec = catalogue.vitest!;
    const targets = spec.files.map((f) => f.target);
    expect(targets).toEqual(["vitest.config.ts", "tests/stubs/server-only.ts"]);

    const config = readFileSync(
      path.join(TEMPLATES_DIR, "vitest/vitest.config.ts.tpl"),
      "utf8"
    );
    expect(config).toContain(
      '"server-only": path.join(root, "tests/stubs/server-only.ts")'
    );
    expect(config).toContain('"@": root');
    expect(config).toContain("inline: [/node_modules\\/@intelligo-dev\\//]");
    expect(spec.nextSteps?.join("\n")).toMatch(/add -D vitest/);
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

describe("template versions", () => {
  // upgrade --check shows `installed → current` per feature; a template
  // edited under the same version shows a change with no version to
  // explain it. The fixture pins each version's content: edit a
  // template, bump its templateVersion, then record the new pair.
  const fixture = JSON.parse(
    readFileSync(
      path.join(__dirname, "__tests__", "template-versions.json"),
      "utf8"
    )
  ) as Record<string, { templateVersion: string; hash: string }>;

  function contentHash(feature: string): string {
    const hash = createHash("sha256");
    for (const file of catalogue[feature]!.files) {
      hash.update(file.target);
      hash.update(readFileSync(path.join(TEMPLATES_DIR, file.template)));
    }
    return hash.digest("hex");
  }

  it.each(features)("%s changes only with a new templateVersion", (feature) => {
    const pinned = fixture[feature];
    const current = {
      templateVersion: catalogue[feature]!.templateVersion,
      hash: contentHash(feature),
    };
    if (pinned?.templateVersion === current.templateVersion) {
      expect(
        current.hash,
        `${feature}'s templates changed under ${current.templateVersion}: bump templateVersion in templates/manifest.json`
      ).toBe(pinned.hash);
    }
    expect(
      current,
      `record ${feature}'s new version in src/__tests__/template-versions.json`
    ).toEqual(pinned);
  });
});
