/**
 * Every model id written in this repository must be one the shipped
 * catalogue prices.
 *
 * A product registers its own models from its composition root, and
 * `calculateCost` throws on an id it cannot price rather than guessing;
 * `intelligo doctor` checks a consumer's composition root. This is the
 * rule for *this* repository, whose composition roots register
 * `DEFAULT_MODELS` and the ids they list beside it in a
 * `registerModels([...])` call — an unregistered literal here throws at
 * request time. A test registers or deliberately omits its own fixture
 * ids, so in a test only an id from a provider the catalogue or a
 * composition root prices is checked.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { importSpecifiers } from "./tree";

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
 * of known providers is deliberate: a typo'd provider, or one nobody
 * listed, is exactly the mistake worth catching. `notAModelId` removes
 * the other strings of that shape.
 */
const MODEL_ID = /"([a-z][a-z0-9-]*\/[a-z0-9._-]+)"/g;

/** Top-level media types: `image/png` is a MIME type, not a model. */
const MEDIA_TYPES = new Set([
  "application",
  "audio",
  "font",
  "image",
  "multipart",
  "text",
  "video",
]);

/** The workspaces' own names: `billing/plans` names a registry, not a model. */
const WORKSPACES = new Set(
  ["packages", "apps", "tools"].flatMap((dir) =>
    readdirSync(path.join(ROOT, dir))
  )
);

/** First segments that make a string a path in a project tree. */
const PATH_ROOTS = new Set([
  "app",
  "apps",
  "components",
  "lib",
  "packages",
  "tools",
]);

function notAModelId(id: string, specifiers: Set<string>): boolean {
  const [head] = id.split("/");
  return (
    specifiers.has(id) ||
    MEDIA_TYPES.has(head!) ||
    WORKSPACES.has(head!) ||
    PATH_ROOTS.has(head!) ||
    // Tailwind: an opacity (`bg-primary/10`) or a named group or peer.
    /\/[0-9.]+$/.test(id) ||
    /^(group|peer)$/.test(head!) ||
    /\.(tsx?|jsx?|mjs|json|md|css|tpl)$/.test(id)
  );
}

/** Module specifiers, including the ones `vi.mock` and `declare module` name. */
function moduleSpecifiers(text: string): Set<string> {
  const specs = new Set(importSpecifiers(text));
  for (const m of text.matchAll(
    /\b(?:vi\.(?:do)?mock|vi\.importActual|module)\s*\(?\s*["']([^"']+)["']/g
  ))
    specs.add(m[1]!);
  return specs;
}

/**
 * Ids that are deliberately not registered. None: a stub that reaches
 * no provider is still admitted by its price, so it is registered at no
 * cost like any other model.
 */
const ALLOWED_UNREGISTERED = new Set<string>();

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

  it("every model id used in the source is registered", () => {
    const files = ROOTS.flatMap((root) => walk(path.join(ROOT, root)))
      .map((file) => ({
        relative: path.relative(ROOT, file).split(path.sep).join("/"),
        text: stripComments(readFileSync(file, "utf8")),
      }))
      .filter(
        ({ relative }) =>
          !IGNORED_TREES.some((t) => relative.startsWith(t + "/")) &&
          // pricing.ts defines the catalogue; this file names ids to
          // describe the rule.
          relative !== MODELS_FILE &&
          relative !== "tests/architecture/model-registry.test.ts"
      );
    const isTest = (relative: string) => /\.test\.tsx?$/.test(relative);

    const known = catalogueModelIds();
    for (const { relative, text } of files) {
      if (isTest(relative) || !text.includes("registerModels(")) continue;
      for (const m of text.matchAll(/\bid:\s*"([a-z0-9-]+\/[a-z0-9._-]+)"/g))
        known.add(m[1]!);
    }
    const providers = new Set([...known].map((id) => id.split("/")[0]!));

    const offenders: string[] = [];
    for (const { relative, text } of files) {
      const specifiers = moduleSpecifiers(text);
      for (const match of text.matchAll(MODEL_ID)) {
        const id = match[1]!;
        if (known.has(id) || ALLOWED_UNREGISTERED.has(id)) continue;
        if (notAModelId(id, specifiers)) continue;
        if (isTest(relative) && !providers.has(id.split("/")[0]!)) continue;
        offenders.push(`${relative}: ${id}`);
      }
    }

    expect(
      [...new Set(offenders)],
      `model ids nothing in this repository registers, so pricing them throws at request time:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("checks an id from a provider nobody listed", () => {
    expect(notAModelId("deepseek/deepseek-chat", new Set())).toBe(false);
    expect(notAModelId("groq/llama-3.3-70b", new Set())).toBe(false);
    expect(notAModelId("image/png", new Set())).toBe(true);
    expect(notAModelId("bg-primary/10", new Set())).toBe(true);
    expect(notAModelId("ai/test", new Set(["ai/test"]))).toBe(true);
  });
});
