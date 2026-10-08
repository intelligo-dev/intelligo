#!/usr/bin/env node
/**
 * Pull everything the site shows about the framework from the framework
 * itself, so the site can never claim a page or a number that doesn't
 * exist — and commit the result, so a deploy needs nothing but this
 * directory (Cloudflare builds from apps/website and never runs this).
 *
 *   pnpm sync        # repository root: builds the registry first (turbo)
 *
 * Writes:
 *   src/data/registry.json   packages/registry/registry.json, verbatim
 *   src/data/requires.json   packages/registry/requires.json, verbatim
 *   src/data/seams.json      each block's consumer-owned config files
 *   src/content/docs/…       the generated reference pages, and the snippets
 *                            in hand-written ones (scripts/docs.mjs)
 *   src/data/proof.json      counts (tests, items, packages), this tree's version
 *                            and the version npm serves
 *   src/data/package-edges.json
 *                            each package's declared @intelligo-dev/* dependencies
 *   public/r/<version>/*.json
 *                            every release's items, frozen once npm has it
 *   public/r/*.json          the items of the release npm serves —
 *                            intelligo.dev/r/<item>.json is the hosted
 *                            registry consumers install from
 *   src/showcase/app/…       the items' client components, rebuilt from
 *                            scratch on every run
 *   src/components/ui/…      the site chrome's copies of Intelligo components
 *   public/llms.txt          a curated Markdown index of the docs, for an
 *   public/llms-full.txt     LLM/agent (llmstxt.org) — the docs concatenated
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCS_DIR,
  applySnippets,
  docFiles,
  generateData,
  generateDocs,
  generateLlmsTxt,
  isGenerated,
} from "./docs.mjs";
import {
  compareVersions,
  fromRelease,
  toRelease,
} from "./registry-release.mjs";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// apps/website lives inside the framework repository: two directories up.
const FRAMEWORK = resolve(SITE, "../..");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith("."))
      continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// --- registry -------------------------------------------------------------
const registryJson = readFileSync(
  join(FRAMEWORK, "packages/registry/registry.json"),
  "utf8"
);
mkdirSync(join(SITE, "src/data"), { recursive: true });
writeFileSync(join(SITE, "src/data/registry.json"), registryJson);
const registry = JSON.parse(registryJson);

const built = join(FRAMEWORK, "packages/registry/public/r");
if (!existsSync(built)) {
  // A silent stale copy is the failure CI's "sync output is committed"
  // step exists to catch; refuse rather than half-sync.
  console.error(
    "packages/registry/public/r is not built. Run `pnpm sync` from the repository root (it builds the registry first), or `pnpm registry:build` then this script."
  );
  process.exit(1);
}
// The hosted registry is released, not built from main: a consumer on a
// release installs items whose imports that release's packages export.
// public/r/<version>/ keeps every release's items. The tree's version is
// rewritten from the build until npm has it, and frozen from then on;
// public/r/*.json, what the `@intelligo` namespace resolves, is the copy
// of the release npm serves. Within a versioned copy an `@intelligo/<x>`
// dependency names the same release's file, so installing from it never
// mixes releases.
const builtItems = readdirSync(built).filter((f) => f.endsWith(".json"));
const registryRoot = join(SITE, "public/r");
const releaseDir = (v) => join(registryRoot, v);
mkdirSync(registryRoot, { recursive: true });

// --- counts ---------------------------------------------------------------
const testFiles = [
  ...walk(join(FRAMEWORK, "packages")),
  ...walk(join(FRAMEWORK, "tests")),
];
const testCases = testFiles.reduce(
  (n, f) =>
    n + (readFileSync(f, "utf8").match(/^\s*(it|test)\(/gm)?.length ?? 0),
  0
);
const architectureTests = readdirSync(
  join(FRAMEWORK, "tests/architecture")
).filter((f) => f.endsWith(".test.ts")).length;
const registryItems = registry.items.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
).length;
// Published packages only: packages/registry is a private workspace.
const publishedPackages = readdirSync(join(FRAMEWORK, "packages")).filter(
  (p) => {
    const manifest = join(FRAMEWORK, "packages", p, "package.json");
    return (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).private !== true
    );
  }
);
const packages = publishedPackages.length;

// The package graph on /architecture: every declared @intelligo-dev/*
// dependency, which the dependency-direction test holds equal to the
// imports in the source.
const SCOPE = "@intelligo-dev/";
const packageEdges = publishedPackages.sort().flatMap((p) => {
  const m = JSON.parse(
    readFileSync(join(FRAMEWORK, "packages", p, "package.json"), "utf8")
  );
  const declared = {
    ...m.dependencies,
    ...m.peerDependencies,
    ...m.optionalDependencies,
  };
  return Object.keys(declared)
    .filter((name) => name.startsWith(SCOPE))
    .sort()
    .map((name) => ({ from: p, to: name.slice(SCOPE.length) }));
});
writeFileSync(
  join(SITE, "src/data/package-edges.json"),
  JSON.stringify(packageEdges, null, 2) + "\n"
);
const version = JSON.parse(
  readFileSync(join(FRAMEWORK, "packages/core/package.json"), "utf8")
).version;

/**
 * What npm serves under the dist-tag this version releases to — the one
 * version the site may call "on npm". The tree runs ahead of npm between
 * a version bump and its release, and stays ahead if the release fails.
 * Without the network the last answer stands: sync works offline.
 */
async function publishedVersion() {
  const proofPath = join(SITE, "src/data/proof.json");
  const last = existsSync(proofPath)
    ? JSON.parse(readFileSync(proofPath, "utf8")).published
    : undefined;
  const tag = /-([a-z]+)/.exec(version)?.[1] ?? "latest";
  try {
    const response = await fetch(
      "https://registry.npmjs.org/-/package/@intelligo-dev%2fcore/dist-tags",
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) throw new Error(`npm answered ${response.status}`);
    const published = (await response.json())[tag];
    if (!published) throw new Error(`npm has no "${tag}" dist-tag`);
    return published;
  } catch (error) {
    console.warn(
      `proof: could not read npm (${error.message}); keeping published = ${last ?? "unknown"}`
    );
    return last;
  }
}
const published = await publishedVersion();

function writeRelease(release, sourceDir) {
  rmSync(releaseDir(release), { recursive: true, force: true });
  mkdirSync(releaseDir(release), { recursive: true });
  for (const f of readdirSync(sourceDir).filter((n) => n.endsWith(".json"))) {
    writeFileSync(
      join(releaseDir(release), f),
      toRelease(readFileSync(join(sourceDir, f), "utf8"), release)
    );
  }
}

/**
 * A released version's items, built from its `v<release>` tag with that
 * tree's own registry build: a release whose copy is missing gets the
 * source it shipped, not whatever this tree has become.
 */
function buildFromTag(release) {
  const tag = `v${release}`;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${tag}^{commit}`], {
      cwd: FRAMEWORK,
      stdio: "ignore",
    });
  } catch {
    throw new Error(
      `public/r/${release} is missing and the tag ${tag} is not here. Run \`git fetch --tags\` and sync again.`
    );
  }
  const tmp = mkdtempSync(join(tmpdir(), "intelligo-registry-"));
  try {
    const archive = execFileSync("git", ["archive", tag, "packages/registry"], {
      cwd: FRAMEWORK,
      maxBuffer: 1 << 30,
    });
    execFileSync("tar", ["-x", "-C", tmp], { input: archive });
    const root = join(tmp, "packages/registry");
    const build = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
      .scripts.build;
    execFileSync("sh", ["-c", build], {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        PATH: `${join(FRAMEWORK, "packages/registry/node_modules/.bin")}:${process.env.PATH}`,
      },
    });
    writeRelease(release, join(root, "public/r"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// `node scripts/sync-framework.mjs --release <version>` adds an earlier
// release's copy from its tag, and changes nothing else.
const releaseFlag = process.argv.indexOf("--release");
if (releaseFlag !== -1) {
  const release = process.argv[releaseFlag + 1];
  if (!release) throw new Error("--release needs a version");
  buildFromTag(release);
  console.log(`public/r/${release}: built from v${release}`);
  process.exit(0);
}

const released =
  published !== undefined && compareVersions(published, version) >= 0;
if (!released) writeRelease(version, built);
for (const v of new Set([version, published].filter(Boolean))) {
  if (!existsSync(releaseDir(v))) buildFromTag(v);
}
// What the namespace serves: the release npm has, or this tree's version
// while npm has none.
const current = published ?? version;
for (const f of readdirSync(registryRoot)) {
  if (f.endsWith(".json")) rmSync(join(registryRoot, f));
}
for (const f of readdirSync(releaseDir(current))) {
  writeFileSync(
    join(registryRoot, f),
    fromRelease(readFileSync(join(releaseDir(current), f), "utf8"), current)
  );
}
const releases = readdirSync(registryRoot)
  .filter((f) => statSync(join(registryRoot, f)).isDirectory())
  .sort(compareVersions);
console.log(
  `public/r: ${builtItems.length} items built, /r serves ${current}, releases kept: ${releases.join(", ")}`
);

const proof = {
  sampledAt: new Date().toISOString().slice(0, 10),
  version,
  published,
  packages,
  testFiles: testFiles.length,
  testCases,
  architectureTests,
  registryItems,
};
writeFileSync(
  join(SITE, "src/data/proof.json"),
  JSON.stringify(proof, null, 2) + "\n"
);

// --- showcase: the real registry components, installed into the site -------
//
// The hero walkthrough and the registry explorer render the items'
// actual client components (not mock-ups). They are copied from the
// registry exactly as `shadcn add` would place them, with four import
// specifiers rewritten so they run outside Next.js:
//   @/…                      → @showcase/…      (the site's own alias root)
//   next-intl                → use-intl         (the same hooks, framework-free)
//   next/navigation          → a shim
//   @intelligo-dev/auth/client → a shim (sign-in is simulated in a preview)
// Server files (pages, actions, anything importing server-only or
// next-intl/server) are not copied; src/showcase/overrides/** is copied
// last and wins, which is where hand-written type stubs and mocks live.
const SHOWCASE_ITEMS = [
  "auth-login",
  "auth-signup",
  "auth-email-verification",
  "onboarding",
  "app-shell",
  "dashboard",
  "team-settings",
  "pricing",
  "billing-settings",
  "usage",
  "notifications",
  "chat",
  "chat-panel",
  "chat-widget",
  "chat-share",
  "artifacts",
  "trial-banner",
  "feature-gating",
  "route-error",
  "invitation-accept",
  "settings-shell",
  "workspace-settings",
  "auth-password-reset",
  "language-switcher",
  "checkout",
  "payment-poll",
  "profile-settings",
  "privacy-settings",
];
const SERVER_MARKERS = [
  '"server-only"',
  "next-intl/server",
  "next/headers",
  "next/cache",
  '"use server"',
];
const showcaseRoot = join(SITE, "src/showcase/app");

function rewrite(source) {
  return source
    .split("\n")
    .filter((line) => !/^import "server-only";?$/.test(line.trim()))
    .join("\n")
    .replace(/from "@\//g, 'from "@showcase/')
    .replace(/import\("@\//g, 'import("@showcase/')
    .replace(/from "next-intl"/g, 'from "use-intl"')
    .replace(
      /from "next\/navigation"/g,
      'from "@showcase/shims/next-navigation"'
    )
    .replace(
      /from "@intelligo-dev\/auth\/client"/g,
      'from "@showcase/shims/auth-client"'
    );
}

function install(sourcePath, target) {
  const dest = join(showcaseRoot, target);
  mkdirSync(dirname(dest), { recursive: true });
  const raw = readFileSync(sourcePath, "utf8");
  writeFileSync(dest, /\.(ts|tsx)$/.test(target) ? rewrite(raw) : raw);
}

// Rebuilt from nothing, so a file whose source is gone goes too.
rmSync(showcaseRoot, { recursive: true, force: true });

let installed = 0;
for (const name of SHOWCASE_ITEMS) {
  const item = registry.items.find((i) => i.name === name);
  if (!item) throw new Error(`showcase item ${name} is not in registry.json`);
  for (const file of item.files ?? []) {
    const { path: relPath, target, type } = file;
    if (!target || target.startsWith("app/") || target.startsWith("actions/"))
      continue;
    if (
      !["registry:component", "registry:hook", "registry:file"].includes(type)
    )
      continue;
    const source = join(FRAMEWORK, "packages/registry", relPath);
    if (/\.(ts|tsx)$/.test(target)) {
      const text = readFileSync(source, "utf8");
      if (SERVER_MARKERS.some((m) => text.includes(m))) continue;
    }
    install(source, target);
    installed++;
  }
}

// The shadcn primitives the items render with, from the reference app —
// the same files `shadcn add` would install for a consumer.
const primitives = join(FRAMEWORK, "apps/app/components/ui");
for (const f of readdirSync(primitives)) {
  if (f === "sonner.tsx") continue; // next-themes; the preview mounts <Toaster /> itself
  install(join(primitives, f), `components/ui/${f}`);
  installed++;
}
install(join(FRAMEWORK, "apps/app/lib/utils.ts"), "lib/utils.ts");

// Every Intelligo component from its registry source, so /components shows
// the ones no block installs into the reference app as well.
for (const item of registry.items.filter((i) => i.type === "registry:ui")) {
  for (const { path: relPath, target } of item.files ?? []) {
    install(join(FRAMEWORK, "packages/registry", relPath), target);
    installed++;
  }
}

// The site's own chrome renders the same components: a copy in
// src/components/ui that is an Intelligo item follows its registry source.
const chrome = join(SITE, "src/components/ui");
for (const item of registry.items.filter((i) => i.type === "registry:ui")) {
  for (const { path: relPath, target } of item.files ?? []) {
    const dest = join(chrome, target.replace(/^components\/ui\//, ""));
    if (existsSync(dest))
      cpSync(join(FRAMEWORK, "packages/registry", relPath), dest);
  }
}

// Hand-written stubs and mocks, and the shadcn components the catalog
// shows that neither an item nor the reference app installs, copied last
// so they win.
const overrides = join(SITE, "src/showcase/overrides");
if (existsSync(overrides)) cpSync(overrides, showcaseRoot, { recursive: true });

console.log(
  `showcase: ${installed} files from ${SHOWCASE_ITEMS.length} items into src/showcase/app`
);

console.log(
  `proof: v${version} (npm has ${published ?? "unknown"}), ${packages} packages, ${testCases} tests in ${testFiles.length} files, ${architectureTests} architecture suites, ${registryItems} items`
);

// --- docs: generated reference pages and snippets ----------------------------
const docsRoot = join(SITE, DOCS_DIR);
for (const rel of docFiles(SITE)) {
  if (isGenerated(rel)) rmSync(join(docsRoot, rel)); // a page whose source is gone goes too
}
const pages = generateDocs(FRAMEWORK);
for (const [rel, content] of Object.entries(pages)) {
  mkdirSync(dirname(join(docsRoot, rel)), { recursive: true });
  writeFileSync(join(docsRoot, rel), content);
}
let snippetFiles = 0;
for (const rel of docFiles(SITE).filter((r) => !isGenerated(r))) {
  const file = join(docsRoot, rel);
  const before = readFileSync(file, "utf8");
  const after = applySnippets(before, FRAMEWORK);
  if (after !== before) {
    writeFileSync(file, after);
    snippetFiles++;
  }
}
for (const [rel, content] of Object.entries(generateData(FRAMEWORK))) {
  writeFileSync(join(SITE, rel), content);
}
console.log(
  `docs: ${Object.keys(pages).length} generated pages, snippets refreshed in ${snippetFiles} files`
);

// --- llms.txt: an agent-readable index and full-text mirror of the docs ---
for (const [rel, content] of Object.entries(generateLlmsTxt(SITE))) {
  writeFileSync(join(SITE, rel), content);
}
console.log("llms.txt: public/llms.txt and public/llms-full.txt written");
