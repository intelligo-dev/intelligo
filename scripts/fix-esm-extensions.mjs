#!/usr/bin/env node
/**
 * Give every relative import in a built package an explicit extension.
 *
 * The sources import `./foo` and `../db` without extensions, which
 * TypeScript, Vite and Turbopack all resolve. Node's ESM loader does
 * not, and neither does vitest's resolver when it treats a package in
 * node_modules as external — so a consumer running `node`/`tsx`
 * scripts or vitest against the published `dist` got "Cannot find
 * module …/dist/components/button". tsc emits specifiers verbatim, so
 * this runs after it and rewrites `./foo` → `./foo.js` (or
 * `./foo/index.js`) in every .js and .d.ts under the given directory.
 *
 *   node ../../scripts/fix-esm-extensions.mjs dist
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "dist");
if (!existsSync(dir)) {
  console.error(`fix-esm-extensions: ${dir} does not exist`);
  process.exit(1);
}

const SPEC =
  /((?:import|export)\s[^"'`;]*?from\s*|import\s*\(\s*|import\s+)(["'])(\.{1,2}\/[^"'`]+)\2/g;

function walk(d, out = []) {
  for (const entry of readdirSync(d)) {
    const p = path.join(d, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|d\.ts)$/.test(entry)) out.push(p);
  }
  return out;
}

let rewritten = 0;
const unresolved = [];
for (const file of walk(dir)) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(SPEC, (m, pre, q, spec) => {
    if (/\.(js|mjs|cjs|json|css)$/.test(spec)) return m;
    const base = path.resolve(path.dirname(file), spec);
    let next;
    if (existsSync(base + ".js")) next = spec + ".js";
    else if (existsSync(path.join(base, "index.js")))
      next = spec.replace(/\/$/, "") + "/index.js";
    else {
      unresolved.push(`${path.relative(dir, file)}: ${spec}`);
      return m;
    }
    rewritten++;
    return `${pre}${q}${next}${q}`;
  });
  if (out !== src) writeFileSync(file, out);
}

if (unresolved.length) {
  console.error(
    `fix-esm-extensions: could not resolve\n  ${unresolved.join("\n  ")}`
  );
  process.exit(1);
}
console.log(
  `fix-esm-extensions: ${rewritten} specifiers in ${path.relative(process.cwd(), dir)}`
);
