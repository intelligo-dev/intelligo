/**
 * Publishability.
 *
 * Every workspace under packages/ is released to npm from a version
 * tag (.github/workflows/release.yml), and this repository is public
 * with it. Publication is a one-way door: a credential or a private
 * name that ships is public permanently, and no later commit takes it
 * back. So the audit runs on every commit rather than once at release
 * time.
 *
 * The dependency-direction test covers imports. This one covers what
 * an import graph cannot see: licence metadata, credentials, and the
 * vocabulary of the products built on the framework — which has no
 * place in the framework (AGENTS.md, "the boundary").
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  APPS_DIR,
  PACKAGES_DIR,
  ROOT,
  TOOLS_DIR,
  listWorkspaces,
  walk,
} from "./tree";

type PackageManifest = {
  private?: boolean;
  description?: string;
  keywords?: string[];
  repository?: { type?: string; url?: string; directory?: string };
  files?: string[];
  engines?: { node?: string };
  sideEffects?: false | string[];
  exports?: Record<string, unknown>;
  publishConfig?: { exports?: Record<string, unknown> };
};

function manifest(pkg: string): PackageManifest {
  return JSON.parse(
    readFileSync(path.join(PACKAGES_DIR, pkg, "package.json"), "utf8")
  ) as PackageManifest;
}

/** What is on npm: every package under packages/ not marked private. */
const PUBLISHED = listWorkspaces(PACKAGES_DIR).filter(
  (pkg) => manifest(pkg).private !== true
);

/**
 * Credential shapes, written to match real values and not the
 * placeholders documentation is full of. `sk-` alone would flag every
 * `sk-...` in a comment; twenty following characters would not be
 * there by accident.
 */
const SECRET_PATTERNS: {
  name: string;
  re: RegExp;
  /** A value the pattern must match — proves the regex is still one. */
  sample: string;
  allow?: (match: RegExpMatchArray) => boolean;
}[] = [
  {
    name: "OpenAI key",
    re: /\bsk-[A-Za-z0-9_-]{20,}/,
    sample: "sk-" + "A".repeat(24),
  },
  {
    name: "Stripe secret key",
    re: /\bsk_(live|test)_[A-Za-z0-9]{20,}/,
    sample: "sk_live_" + "A".repeat(24),
  },
  {
    name: "Stripe webhook secret",
    re: /\bwhsec_[A-Za-z0-9]{20,}/,
    sample: "whsec_" + "A".repeat(24),
  },
  {
    name: "Resend key",
    re: /\bre_[A-Za-z0-9]{20,}/,
    sample: "re_" + "A".repeat(24),
  },
  {
    name: "AWS access key id",
    re: /\bAKIA[0-9A-Z]{16}\b/,
    sample: "AKIA" + "A".repeat(16),
  },
  {
    name: "private key block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    // Split so this file does not itself trip the scan.
    sample: "-----BEGIN RSA " + "PRIVATE KEY-----",
  },
  {
    name: "database URL with credentials",
    re: /\bpostgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@([^\s/]+)/,
    sample: "postgresql://user:" + "secret@db.internal:5432/app",
    // Documentation is full of connection strings. A local host or a
    // placeholder is a worked example; a real hostname with a real
    // password is the thing worth failing a build over.
    allow: (match) => {
      const host = (match[2] ?? "").split(":")[0]!.toLowerCase();
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "host" ||
        host === "postgres" ||
        host.endsWith(".example.com") ||
        host === "example.com"
      );
    },
  },
];

/**
 * The vocabulary of the products built on this framework: their names,
 * brands and hostnames. None of them has a place in a framework
 * package, a registry item, the reference app or the docs — a comment
 * that needs one is a boundary being described instead of held
 * (AGENTS.md).
 *
 * Only the generic rules live in this file. Listing a product here
 * would publish the very names the rule keeps out, so the specific
 * list is read from `INTELLIGO_PRIVATE_VOCABULARY` (CI takes it from a
 * repository secret) or from a gitignored `.private-vocabulary` file:
 * one case-insensitive regular expression per line, optionally
 * followed by ` || <sample>`, `#` for comments. Where neither exists —
 * a fork's pull request — only the generic rules run; on a push to
 * main a missing list fails the build instead of going quiet.
 *
 * An entry with a sample must match it, so a regex that stops matching
 * cannot quietly stop ruling.
 */
const GENERIC_VOCABULARY: { re: RegExp; sample?: string }[] = [
  { re: /\bprivate\/[a-z]/, sample: "private/app" },
  { re: /\bincubation\b/i, sample: "incubation" },
  { re: /extract-public/, sample: "scripts/extract-public.ts" },
];

function privateVocabulary(): { re: RegExp; sample?: string }[] {
  const file = path.join(ROOT, ".private-vocabulary");
  const source =
    process.env.INTELLIGO_PRIVATE_VOCABULARY ||
    (existsSync(file) ? readFileSync(file, "utf8") : "");
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const at = line.lastIndexOf(" || ");
      const pattern = at === -1 ? line : line.slice(0, at).trim();
      const sample = at === -1 ? undefined : line.slice(at + 4).trim();
      return { re: new RegExp(pattern, "i"), sample };
    });
}

const PRIVATE_ENTRIES = privateVocabulary();
const PRIVATE_VOCABULARY = [...GENERIC_VOCABULARY, ...PRIVATE_ENTRIES];

/**
 * Where the vocabulary rule does not look.
 *
 *   - `packages/core/src/db/migrations`: `intelligo migrate` hashes
 *     every .sql file, so their contents are frozen; the snapshots
 *     beside them describe those same files.
 *   - `packages/registry/public`: build output of `packages/registry/base`,
 *     already scanned.
 *   - this file, which describes the rule.
 */
const VOCABULARY_EXEMPT = [
  "packages/core/src/db/migrations/",
  "packages/registry/public/",
  "tests/architecture/publishability.test.ts",
  "pnpm-lock.yaml",
];

const TEXT_FILE =
  /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx|json|md|mdx|css|sql|ya?ml|tpl|astro|txt)$/;

/**
 * Every tracked text file in the tree. A real `.env` is gitignored and
 * holds real secrets, so those are skipped here and read separately by
 * the "local .env values" rule below.
 */
function treeFiles(): { file: string; text: string }[] {
  return walk(
    ROOT,
    (name) => TEXT_FILE.test(name) || name === ".env.example"
  ).map((file) => ({
    file: path.relative(ROOT, file).split(path.sep).join("/"),
    text: readFileSync(file, "utf8"),
  }));
}

/** Non-placeholder values from any local .env file, if one exists. */
function localEnvValues(): { source: string; key: string; value: string }[] {
  const candidates = [
    ".env",
    ".env.local",
    ...listWorkspaces(APPS_DIR).map((app) => `apps/${app}/.env`),
    ...listWorkspaces(APPS_DIR).map((app) => `apps/${app}/.env.local`),
    ...listWorkspaces(PACKAGES_DIR).map((pkg) => `packages/${pkg}/.env`),
    ...listWorkspaces(TOOLS_DIR).map((tool) => `tools/${tool}/.env`),
  ].filter((rel) => existsSync(path.join(ROOT, rel)));

  const out: { source: string; key: string; value: string }[] = [];
  for (const rel of candidates) {
    for (const line of readFileSync(path.join(ROOT, rel), "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const value = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
      // A short value is a flag or a port; a URL to localhost or an
      // example.com placeholder is what the docs already show.
      if (value.length < 16) continue;
      if (
        /localhost|127\.0\.0\.1|example\.com|dummy|changeme|your[-_]/i.test(
          value
        )
      )
        continue;
      out.push({ source: rel, key: m[1]!, value });
    }
  }
  return out;
}

describe("publishability", () => {
  it("finds the published packages", () => {
    // A silent empty list would make every rule below vacuous.
    expect(PUBLISHED.length).toBeGreaterThan(5);
    expect(PUBLISHED).toContain("core");
  });

  it("publishes every workspace under packages/ that is not deliberately private", () => {
    // The release workflow publishes packages/* wholesale, skipping
    // `private: true`. A private workspace here is a tooling workspace
    // — the registry — and its README has to say so, so nobody reads a
    // packages/ directory as an npm package that failed to ship.
    const unpublished = listWorkspaces(PACKAGES_DIR).filter(
      (pkg) => !PUBLISHED.includes(pkg)
    );
    for (const pkg of unpublished) {
      const readme = path.join(PACKAGES_DIR, pkg, "README.md");
      expect(
        existsSync(readme) &&
          /never published/i.test(readFileSync(readme, "utf8")),
        `packages/${pkg} is private but its README does not say it is never published`
      ).toBe(true);
    }
  });

  it("declares Apache-2.0 on every published package", () => {
    const missing = PUBLISHED.filter((pkg) => {
      const pkgJson = JSON.parse(
        readFileSync(path.join(PACKAGES_DIR, pkg, "package.json"), "utf8")
      ) as { license?: string };
      return pkgJson.license !== "Apache-2.0";
    });

    expect(missing, "packages without an Apache-2.0 license field").toEqual([]);
  });

  it("puts the licence text in every package, not only the manifest", () => {
    // `"license": "Apache-2.0"` is metadata. Apache-2.0 §4(a) requires
    // the terms to travel with the distribution, which the root
    // LICENSE assertion above does not prove.
    const rootLicense = readFileSync(path.join(ROOT, "LICENSE"), "utf8");

    for (const pkg of PUBLISHED) {
      const licensePath = path.join(PACKAGES_DIR, pkg, "LICENSE");
      expect(
        existsSync(licensePath),
        `packages/${pkg} has no LICENSE file to publish`
      ).toBe(true);
      expect(
        readFileSync(licensePath, "utf8"),
        `packages/${pkg}'s LICENSE differs from the repository's`
      ).toBe(rootLicense);

      const files = manifest(pkg).files ?? [];
      expect(
        files,
        `packages/${pkg} does not list LICENSE in "files", so it will not ship`
      ).toContain("LICENSE");
    }
  });

  it("puts the NOTICE in every package", () => {
    // Apache-2.0 §4(d): a NOTICE file that ships with the work ships
    // with every redistribution of it.
    const rootNotice = readFileSync(path.join(ROOT, "NOTICE"), "utf8");

    for (const pkg of PUBLISHED) {
      const noticePath = path.join(PACKAGES_DIR, pkg, "NOTICE");
      expect(
        existsSync(noticePath),
        `packages/${pkg} has no NOTICE file to publish`
      ).toBe(true);
      expect(
        readFileSync(noticePath, "utf8"),
        `packages/${pkg}'s NOTICE differs from the repository's`
      ).toBe(rootNotice);
      expect(
        manifest(pkg).files ?? [],
        `packages/${pkg} does not list NOTICE in "files", so it will not ship`
      ).toContain("NOTICE");
    }
  });

  it("describes every package and links it to its source", () => {
    // npm search and the package page render these; without them a
    // package is a name with nothing under it.
    for (const pkg of PUBLISHED) {
      const m = manifest(pkg);
      expect(
        m.description?.trim(),
        `packages/${pkg} has no description`
      ).toBeTruthy();
      expect(
        m.keywords?.length ?? 0,
        `packages/${pkg} has no keywords`
      ).toBeGreaterThan(0);
      expect(m.repository?.url, `packages/${pkg} repository.url`).toBe(
        "git+https://github.com/intelligo-mn/framework.git"
      );
      expect(
        m.repository?.directory,
        `packages/${pkg} repository.directory`
      ).toBe(`packages/${pkg}`);
    }
  });

  it("ships the sources its maps point at", () => {
    // tsc's .js.map and .d.ts.map files name ../src. Without src in
    // the tarball, a consumer's debugger and go-to-definition land on
    // a file that does not exist.
    for (const pkg of PUBLISHED) {
      const files = manifest(pkg).files ?? [];
      expect(files, `packages/${pkg} does not ship src`).toContain("src");
      expect(files, `packages/${pkg} would publish its tests`).toContain(
        "!src/**/*.test.ts"
      );
    }
  });

  it("gives every package an npm page and a runtime floor", () => {
    for (const pkg of PUBLISHED) {
      expect(
        existsSync(path.join(PACKAGES_DIR, pkg, "README.md")),
        `packages/${pkg} has no README — its npm page would render empty`
      ).toBe(true);
      expect(
        (manifest(pkg).files ?? []).includes("README.md"),
        `packages/${pkg} does not list README.md in "files"`
      ).toBe(true);

      // Without a floor, a consumer on an older runtime installs
      // cleanly and fails at the first query: the Neon driver needs a
      // global WebSocket, which arrived in Node 22. CI proves 22.
      expect(
        manifest(pkg).engines?.node,
        `packages/${pkg} declares no Node floor`
      ).toBe(">=22.14");
    }
  });

  it("does not ship build metadata", () => {
    // `tsBuildInfoFile` lands inside outDir, and `files: ["dist"]`
    // takes the whole directory — so the tarball would carry a
    // tsbuildinfo nobody installing it can use.
    for (const pkg of PUBLISHED) {
      expect(
        manifest(pkg).files ?? [],
        `packages/${pkg} would publish its tsbuildinfo`
      ).toContain("!dist/**/*.tsbuildinfo");
    }
  });

  it("publishes every subpath it exports", () => {
    // `publishConfig.exports` replaces `exports` wholesale at publish
    // time. A key present in the workspace map and missing from the
    // published one therefore resolves all through development and not
    // at all from the tarball — and nothing else notices, because the
    // workspace never reads `publishConfig`.
    for (const pkg of PUBLISHED) {
      const pkgManifest = manifest(pkg);
      const published = pkgManifest.publishConfig?.exports;
      if (!published) continue;

      const missing = Object.keys(pkgManifest.exports ?? {}).filter(
        (subpath) => !(subpath in published)
      );
      expect(
        missing,
        `packages/${pkg} exports ${missing.join(", ")} in the workspace but not from the published tarball`
      ).toEqual([]);
    }
  });

  it("only claims to be side-effect free where that is true", () => {
    // A bundler told a package is side-effect free may drop a bare
    // `import "server-only"`, which is the guard that stops server code
    // reaching a client bundle. Those packages declare nothing and keep
    // the conservative default.
    const importsServerOnly = new Set(["admin", "auth", "next"]);

    for (const pkg of PUBLISHED) {
      const declared = manifest(pkg).sideEffects;
      if (importsServerOnly.has(pkg)) {
        expect(
          declared,
          `packages/${pkg} imports "server-only"; declaring it side-effect free lets a bundler drop the guard`
        ).toBeUndefined();
      } else {
        expect(
          declared,
          `packages/${pkg} should declare its side effects so consumers can tree-shake it`
        ).toBeDefined();
      }
    }
  });

  it("keeps the applications and tools off npm", () => {
    // `private: true` is what stops `pnpm publish -r` from putting the
    // reference app, the site or the film on a registry by accident. It
    // is the last line of defence, so it is asserted.
    const apps = listWorkspaces(APPS_DIR);
    expect(apps.length).toBeGreaterThan(0);
    const unpublished = [
      ...apps.map((app) => path.join("apps", app)),
      ...listWorkspaces(TOOLS_DIR).map((tool) => path.join("tools", tool)),
    ];

    for (const dir of unpublished) {
      const pkgJson = JSON.parse(
        readFileSync(path.join(ROOT, dir, "package.json"), "utf8")
      ) as { private?: boolean };
      expect(pkgJson.private, `${dir} is not marked private`).toBe(true);
    }
  });

  it("has release notes for the version the manifests carry", () => {
    // The release workflow refuses a version with no CHANGELOG section
    // (scripts/release-notes.mjs). Failing here, before the merge that
    // would publish, is the cheaper place to find out.
    const version = JSON.parse(
      readFileSync(path.join(PACKAGES_DIR, "core/package.json"), "utf8")
    ).version as string;
    const notes = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts/release-notes.mjs"), version],
      { encoding: "utf8" }
    );
    expect(
      notes.trim().length,
      `CHANGELOG.md has no section for ${version}`
    ).toBeGreaterThan(0);
  });

  it("ships a LICENSE and the governance documents", () => {
    for (const file of [
      "LICENSE",
      "NOTICE",
      "CODE_OF_CONDUCT.md",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "TRADEMARK.md",
      "README.md",
      "CHANGELOG.md",
    ]) {
      expect(existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(
        true
      );
    }
    // A licence file that lost its terms is worse than none: it looks
    // settled while granting nothing.
    const license = readFileSync(path.join(ROOT, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain(
      "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"
    );
  });

  describe("credentials", () => {
    it("has patterns that still match a credential", () => {
      for (const { name, re, sample, allow } of SECRET_PATTERNS) {
        const match = sample.match(re);
        expect(
          match,
          `${name} pattern no longer matches its sample`
        ).not.toBeNull();
        expect(allow?.(match!) ?? false, `${name} sample is allowed`).toBe(
          false
        );
      }
    });

    it("appear nowhere in the tree", () => {
      const files = treeFiles();
      expect(files.length).toBeGreaterThan(200);

      const hits: string[] = [];
      for (const { file, text } of files) {
        for (const { name, re, allow } of SECRET_PATTERNS) {
          const match = text.match(re);
          if (!match) continue;
          if (allow?.(match)) continue;
          hits.push(`${file} looks like it contains a ${name}`);
        }
      }

      expect(hits, `possible credentials:\n  ${hits.join("\n  ")}`).toEqual([]);
    });

    it("local .env values appear nowhere in the tree", () => {
      // The .env files are gitignored, so a value pasted from one into
      // a test fixture or a doc is the leak a pattern list cannot
      // anticipate. Skipped silently where there is no .env — CI has
      // none — which is why the pattern rule above stays independent.
      const values = localEnvValues();
      const files = treeFiles();

      const hits: string[] = [];
      for (const { source, key, value } of values) {
        for (const { file, text } of files) {
          if (text.includes(value))
            hits.push(`${file} contains ${source}:${key}`);
        }
      }

      expect(
        hits,
        `local secrets in the tree:\n  ${hits.join("\n  ")}`
      ).toEqual([]);
    });
  });

  describe("private vocabulary", () => {
    it("is configured wherever the build can see the secret", () => {
      // A push to main runs with repository secrets. A list that is
      // missing there is a rule that silently stopped running.
      if (
        process.env.GITHUB_ACTIONS === "true" &&
        process.env.GITHUB_EVENT_NAME === "push"
      ) {
        expect(
          PRIVATE_ENTRIES.length,
          "INTELLIGO_PRIVATE_VOCABULARY is empty on a push build"
        ).toBeGreaterThan(0);
      }
    });

    it("has patterns that still match their sample", () => {
      for (const { re, sample } of PRIVATE_VOCABULARY) {
        if (sample === undefined) continue;
        expect(re.test(sample), `${re} no longer matches "${sample}"`).toBe(
          true
        );
      }
    });

    it("appears nowhere outside the exempt history and marketing", () => {
      const files = treeFiles().filter(
        ({ file }) =>
          !VOCABULARY_EXEMPT.some((prefix) => file.startsWith(prefix))
      );
      expect(files.length).toBeGreaterThan(200);

      const hits: string[] = [];
      for (const { file, text } of files) {
        const lines = text.split("\n");
        for (const { re } of PRIVATE_VOCABULARY) {
          const index = lines.findIndex((line) => re.test(line));
          if (index !== -1) {
            hits.push(
              `${file}:${index + 1} matches ${re} — ${lines[index]!.trim()}`
            );
          }
        }
      }

      expect(
        hits,
        `product vocabulary in the framework tree:\n  ${hits.join("\n  ")}`
      ).toEqual([]);
    });
  });
});

describe("ported code carries its licence", () => {
  const LICENSES = path.join(PACKAGES_DIR, "registry/LICENSES.md");

  it("keeps every adapted licence's text in packages/registry/LICENSES.md", () => {
    const text = readFileSync(LICENSES, "utf8");
    expect(text).toContain("## shadcn/ui");
    expect(text).toContain("## MIT-licensed components");
    expect(text).toContain("## Vercel AI Elements");
    expect(text).toContain("Permission is hereby granted, free of charge");
    expect(text).toContain("Apache License, Version 2.0");
  });
});
