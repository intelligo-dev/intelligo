/**
 * Every model id written in this repository must be one the shipped
 * catalogue prices.
 *
 * A product registers its own models from its composition root, and
 * `calculateCost` throws on an id it cannot price rather than guessing;
 * `intelligo doctor` checks a consumer's composition root. This is the
 * rule for *this* repository, whose composition roots register
 * `DEFAULT_MODELS` and nothing else — an unregistered literal here
 * throws at request time.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// The registry lives with execution cost accounting, not
// with the provider clients.
const MODELS_FILE = "packages/executions/src/pricing.ts";

/**
 * The catalogue is read out of the source rather than imported: this
 * project is not a workspace package and cannot resolve @intelligo-dev/*.
 * Parsing also keeps the check honest about what is *written* in the
 * file, which is what every other literal in the repo has to match.
 */
function catalogueModelIds(): Set<string> {
  const text = readFileSync(path.join(ROOT, MODELS_FILE), "utf8");
  const start = text.indexOf("export const DEFAULT_MODELS");
  const block = start === -1 ? "" : text.slice(start);
  return new Set(
    [...block.matchAll(/^\s{4}id: "([a-z0-9-]+\/[a-z0-9._-]+)",$/gm)].map(
      (m) => m[1]!
    )
  );
}
const ROOTS = ["packages", "apps", "tools"];

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  ".astro",
  ".wrangler",
  "coverage",
]);

/**
 * Trees that are prose about the framework rather than code that calls
 * a provider. apps/website quotes this rule's own failure output — with a
 * deliberately unregistered id — to show what the rule catches; scanning
 * it would make the demonstration the violation.
 */
const IGNORED_TREES = ["apps/website"];

/**
 * A provider-prefixed model id. Matching the shape rather than a list
 * of known providers is deliberate: a typo'd provider is exactly the
 * mistake worth catching.
 */
const MODEL_ID =
  /"((?:openai|anthropic|google|xai|mistral|meta)\/[a-z0-9._-]+)"/g;

/**
 * Ids that are deliberately not registered.
 *
 * `reference/echo-1` is the reference app's stub, which never reaches a
 * provider — it exists to exercise the accounting path with a name that
 * obviously is not a real model.
 */
const ALLOWED_UNREGISTERED = new Set<string>(["reference/echo-1"]);

/**
 * Comments are stripped before scanning: a comment may name a broken
 * id to explain it, and a rule that punishes documenting a defect gets
 * the documentation deleted rather than the defect.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("model registry", () => {
  it("parses the catalogue out of the source", () => {
    // A silent empty set would make the assertion below vacuous. This
    // file parses rather than imports, so a renamed catalogue would
    // match nothing and the rule would keep passing while enforcing
    // nothing at all.
    const known = catalogueModelIds();
    expect(known.size).toBeGreaterThan(3);
    expect(known.has("google/gemini-2.5-flash")).toBe(true);
  });

  it("every model id used in the source is in the shipped catalogue", () => {
    const known = catalogueModelIds();
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (IGNORED_TREES.some((t) => rel.startsWith(t + "/"))) continue;
        // pricing.ts defines the catalogue; the audit that scans for
        // unregistered ids necessarily names one.
        const relative = path.relative(ROOT, file);
        if (relative === MODELS_FILE) continue;
        if (relative.endsWith("tests/architecture/model-registry.test.ts"))
          continue;

        const text = stripComments(readFileSync(file, "utf8"));
        for (const match of text.matchAll(MODEL_ID)) {
          const id = match[1]!;
          if (known.has(id) || ALLOWED_UNREGISTERED.has(id)) continue;
          offenders.push(`${relative}: ${id}`);
        }
      }
    }

    expect(
      [...new Set(offenders)],
      `model ids that are not in DEFAULT_MODELS — nothing in this repository registers them, so pricing them throws at request time:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
