/**
 * Every model id in the repository must exist in MODEL_CONFIGS.
 *
 * An unregistered id does not fail — it degrades, twice, in opposite
 * directions. `getModel()` warns and falls back to Gemini Flash;
 * `calculateCost()` warns and prices at the worst-case Claude rate
 * ($3/$15 per M). So the call runs on the cheapest model available and
 * bills the customer for the most expensive one, and the only symptom
 * is a console warning on a server nobody is reading.
 *
 * `openai/gpt-4o` and `openai/gpt-4o-mini` did this in five places,
 * including the model stored on every conversation `createConversation`
 * made — which is the id the chat page then uses for its quota
 * estimate and for the turn itself.
 *
 * The cookie path was already guarded (`modelCookie in MODEL_CONFIGS`).
 * This is the same guard for every literal in the source.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// The registry lives with execution cost accounting (ADR-0008), not
// with the provider clients — and unlike `@intelligo-dev/ai`, it is in
// the public foundation, so this rule still has a subject there.
const MODELS_FILE = "packages/executions/src/pricing.ts";

/**
 * The registry is read out of the source rather than imported: this
 * project is not a workspace package and cannot resolve @intelligo-dev/*.
 * Parsing also keeps the check honest about what is *written* in the
 * file, which is what every other literal in the repo has to match.
 */
function registeredModelIds(): Set<string> {
  const text = readFileSync(path.join(ROOT, MODELS_FILE), "utf8");
  const start = text.indexOf("MODEL_CONFIGS");
  const end = text.indexOf("export type ModelId");
  const block = text.slice(start, end === -1 ? undefined : end);
  return new Set(
    [...block.matchAll(/^\s{2}"([a-z0-9-]+\/[a-z0-9._-]+)":/gm)].map(
      (m) => m[1]!
    )
  );
}
const ROOTS = ["packages", "private", "apps"];

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
 * a provider. apps/site quotes this rule's own failure output — with a
 * deliberately unregistered id — to show what the rule catches; scanning
 * it would make the demonstration the violation.
 */
const IGNORED_TREES = ["apps/site"];

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
 * Comments are stripped before scanning. Several of them name a
 * previously-broken id precisely in order to explain why it was
 * broken — including the chat page that already fixed this bug once —
 * and a rule that punishes documenting a defect gets the documentation
 * deleted rather than the defect.
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
  it("parses the registry out of the source", () => {
    // A silent empty set would make the assertion below vacuous — and
    // this file parses rather than imports, so a refactor of models.ts
    // could quietly empty it.
    const known = registeredModelIds();
    expect(known.size).toBeGreaterThan(3);
    expect(known.has("google/gemini-2.5-flash")).toBe(true);
  });

  it("every model id used in the source is registered", () => {
    const known = registeredModelIds();
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (IGNORED_TREES.some((t) => rel.startsWith(t + "/"))) continue;
        // models.ts defines the registry; the audit that scans for
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
      `model ids that are not in MODEL_CONFIGS — these run on Gemini Flash and bill at Claude rates:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
