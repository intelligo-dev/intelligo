/**
 * `intelligo add <feature>` — generate consumer-owned source.
 *
 * "Owned" is the operative word: the files land in the
 * consumer's repository and Intelligo stops deciding what is in them.
 * The manifest records what was written and its hash so a later
 * upgrade can tell an untouched file from one the consumer has made
 * their own, and refuse to overwrite the latter.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  emptyManifest,
  hashContents,
  readManifest,
  recordFeature,
  writeManifest,
  type GeneratedFile,
} from "../manifest.js";

export type TemplateFile = { template: string; target: string };
/** A route the feature needs called on a schedule (five-field cron). */
export type TemplateCron = { path: string; schedule: string };
export type TemplateFeature = {
  templateVersion: string;
  description: string;
  /** Set when a registry item supersedes this template feature. */
  deprecated?: string;
  files: TemplateFile[];
  cron?: TemplateCron;
  /** What the developer still does by hand once the files are written. */
  nextSteps?: string[];
};
export type TemplateCatalogue = Record<string, TemplateFeature>;

export function readCatalogue(templatesDir: string): TemplateCatalogue {
  return JSON.parse(
    readFileSync(path.join(templatesDir, "manifest.json"), "utf8")
  ) as TemplateCatalogue;
}

export type AddResult = {
  feature: string;
  /** The catalogue's deprecation notice, when the feature has one. */
  deprecated?: string;
  written: string[];
  /** Present and modified by the consumer — left untouched. */
  skippedCustomized: string[];
  /** Present but not ours (no manifest record) — left untouched. */
  skippedUnknown: string[];
  /**
   * The feature's schedule and what became of it: `written` to a new
   * vercel.json, already `present` in the app's own, or `manual` — the
   * app has a vercel.json without it, which is the consumer's to edit.
   */
  cron?: TemplateCron & { status: "written" | "present" | "manual" };
  /** The catalogue's steps left to the developer, printed after the files. */
  nextSteps?: string[];
};

export type AddOptions = {
  appRoot: string;
  templatesDir: string;
  frameworkVersion: string;
  /** Re-write files the consumer has customized. Off by default. */
  force?: boolean;
  /**
   * Placeholder substitutions applied to template contents, e.g.
   * `{ __APP_NAME__: "acme" }`. Applied before hashing, so the
   * recorded hash describes what actually landed on disk.
   */
  variables?: Record<string, string>;
};

export function substitute(
  contents: string,
  variables: Record<string, string> | undefined
): string {
  if (!variables) return contents;
  return Object.entries(variables).reduce(
    (out, [key, value]) => out.split(key).join(value),
    contents
  );
}

/** A `__NAME__` placeholder the variables did not fill. */
const PLACEHOLDER = /__[A-Z][A-Z0-9_]*__/;

const VERCEL_CONFIG = "vercel.json";

/**
 * Schedule the cron in vercel.json when the app has none. An existing
 * one is deployment configuration the consumer wrote: it is read to see
 * whether the path is already scheduled, never written. The file is not
 * recorded in the manifest either — it is the consumer's from the start.
 */
function scheduleCron(
  appRoot: string,
  cron: TemplateCron
): "written" | "present" | "manual" {
  const file = path.join(appRoot, VERCEL_CONFIG);
  if (!existsSync(file)) {
    const config = {
      $schema: "https://openapi.vercel.sh/vercel.json",
      crons: [cron],
    };
    writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    return "written";
  }
  try {
    const config = JSON.parse(readFileSync(file, "utf8")) as {
      crons?: Array<{ path?: string }>;
    };
    return config.crons?.some((c) => c.path === cron.path)
      ? "present"
      : "manual";
  } catch {
    return "manual";
  }
}

export function addFeature(feature: string, options: AddOptions): AddResult {
  const catalogue = readCatalogue(options.templatesDir);
  const spec = catalogue[feature];
  if (!spec) {
    throw new Error(
      `Unknown feature "${feature}". Available: ${Object.keys(catalogue).join(", ")}`
    );
  }

  const manifest =
    readManifest(options.appRoot) ?? emptyManifest(options.frameworkVersion);
  const previous = manifest.features[feature];
  const previousByPath = new Map(
    (previous?.files ?? []).map((f) => [f.path, f])
  );

  const result: AddResult = {
    feature,
    written: [],
    skippedCustomized: [],
    skippedUnknown: [],
  };
  if (spec.deprecated) result.deprecated = spec.deprecated;
  if (spec.nextSteps?.length) result.nextSteps = spec.nextSteps;
  const recorded: GeneratedFile[] = [];
  const handedOver = new Set(previous?.handedOver ?? []);

  // Checked before anything is written, so a refusal leaves no half-made
  // feature behind.
  for (const file of spec.files) {
    const unfilled = substitute(
      readFileSync(path.join(options.templatesDir, file.template), "utf8"),
      options.variables
    ).match(PLACEHOLDER);
    if (unfilled) {
      throw new Error(
        `${feature} needs a value for ${unfilled[0]} that only \`intelligo create\` supplies — ` +
          "run `intelligo create <directory>`, or `intelligo create .` in an empty one."
      );
    }
  }

  for (const file of spec.files) {
    // A registry item replaced it; `intelligo sync` keeps it now.
    if (handedOver.has(file.target)) continue;
    const source = path.join(options.templatesDir, file.template);
    const target = path.join(options.appRoot, file.target);
    const contents = substitute(
      readFileSync(source, "utf8"),
      options.variables
    );
    if (existsSync(target) && !options.force) {
      const current = hashContents(readFileSync(target, "utf8"));
      const known = previousByPath.get(file.target);

      if (!known) {
        // Not ours: a file we never generated already occupies the
        // path. Overwriting it would destroy work we cannot attribute.
        result.skippedUnknown.push(file.target);
        continue;
      }
      if (current !== known.hash) {
        result.skippedCustomized.push(file.target);
        // Keep the ORIGINAL hash: it is the baseline that says "this is
        // customized", and replacing it with the current hash would
        // silently re-adopt the consumer's file as ours.
        recorded.push(known);
        continue;
      }
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
    recorded.push({ path: file.target, hash: hashContents(contents) });
    result.written.push(file.target);
  }

  if (spec.cron) {
    result.cron = {
      ...spec.cron,
      status: scheduleCron(options.appRoot, spec.cron),
    };
  }

  writeManifest(
    options.appRoot,
    recordFeature(
      manifest,
      feature,
      spec.templateVersion,
      recorded,
      options.variables
    )
  );

  return result;
}

export function formatAddResult(r: AddResult): string {
  const lines = [`${r.feature}:`];
  if (r.deprecated) lines.push(`  ⚠ deprecated: ${r.deprecated}`);
  for (const f of r.written) lines.push(`  + ${f}`);
  for (const f of r.skippedCustomized)
    lines.push(`  = ${f} (yours — left alone; use --force to overwrite)`);
  for (const f of r.skippedUnknown)
    lines.push(`  ! ${f} (already exists and was not generated by Intelligo)`);
  if (r.cron?.status === "written")
    lines.push(`  + ${VERCEL_CONFIG} (${r.cron.path} on "${r.cron.schedule}")`);
  if (
    r.written.length === 0 &&
    r.skippedCustomized.length === 0 &&
    r.skippedUnknown.length === 0 &&
    r.cron?.status !== "written"
  )
    lines.push("  nothing to do");
  if (r.cron) lines.push(...cronNextSteps(r.cron));
  if (r.nextSteps?.length) {
    lines.push("", "  Next:", ...r.nextSteps.map((step) => `  - ${step}`));
  }
  return lines.join("\n");
}

/**
 * Non-zero when a file the feature needs is still missing: one that
 * exists but was not generated by Intelligo was left alone, so the
 * feature is not installed as the catalogue describes it.
 */
export function addExitCode(r: AddResult): number {
  return r.skippedUnknown.length > 0 ? 1 : 0;
}

function cronNextSteps(cron: NonNullable<AddResult["cron"]>): string[] {
  const entry = JSON.stringify({ path: cron.path, schedule: cron.schedule });
  const lines = ["", "  Next:"];
  if (cron.status === "manual") {
    lines.push(
      `  - ${VERCEL_CONFIG} is yours and was left alone. Add to its "crons":`,
      `      ${entry}`
    );
  }
  lines.push(
    "  - Set CRON_SECRET (32+ characters). Vercel sends it as the Bearer token itself.",
    "  - Vercel Hobby runs a cron at most once a day and refuses a deployment that",
    `    asks for more. On Hobby, or on any other host, remove the ${VERCEL_CONFIG} entry`,
    "    and call the route from your own scheduler at the same cadence:",
    `      curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-app>${cron.path}`
  );
  return lines;
}
