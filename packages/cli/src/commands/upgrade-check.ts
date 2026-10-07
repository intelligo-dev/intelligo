/**
 * `intelligo upgrade --check`
 *
 * Reports what a template upgrade would do, and does nothing. Upgrades
 * never overwrite consumer source, so the interesting output is not
 * "these templates changed" but "these changed AND you have edited
 * them" — the set where the consumer has to make a decision.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readCatalogue, substitute } from "./add.js";
import {
  hashContents,
  readManifest,
  writeManifest,
  type Manifest,
} from "../manifest.js";

export type UpgradeItem = {
  feature: string;
  path: string;
  /**
   * - `current`    — generated file matches the current template
   * - `outdated`   — template changed; the local copy is untouched, so
   *                  re-generating is safe
   * - `conflict`   — template changed AND the consumer edited the file
   * - `customized` — consumer edited it; template unchanged
   * - `deleted`    — consumer removed it
   * - `new`        — the template has a file this app was never given
   */
  state: "current" | "outdated" | "conflict" | "customized" | "deleted" | "new";
};

export type UpgradeReport = {
  installedVersion: Record<string, string>;
  templateVersion: Record<string, string>;
  items: UpgradeItem[];
};

export type UpgradeCheckOptions = {
  appRoot: string;
  templatesDir: string;
};

export function upgradeCheck(options: UpgradeCheckOptions): UpgradeReport {
  const manifest: Manifest | null = readManifest(options.appRoot);
  if (!manifest) {
    return { installedVersion: {}, templateVersion: {}, items: [] };
  }

  const catalogue = readCatalogue(options.templatesDir);
  const report: UpgradeReport = {
    installedVersion: {},
    templateVersion: {},
    items: [],
  };

  for (const [feature, entry] of Object.entries(manifest.features)) {
    const spec = catalogue[feature];
    report.installedVersion[feature] = entry.templateVersion;
    if (spec) report.templateVersion[feature] = spec.templateVersion;

    const targetToTemplate = new Map(
      (spec?.files ?? []).map((f) => [f.target, f.template])
    );

    for (const target of newFiles(spec, [
      ...entry.files,
      ...(entry.handedOver ?? []).map((handed) => ({ path: handed })),
    ])) {
      report.items.push({ feature, path: target, state: "new" });
    }

    for (const file of entry.files) {
      const abs = path.join(options.appRoot, file.path);
      if (!existsSync(abs)) {
        report.items.push({ feature, path: file.path, state: "deleted" });
        continue;
      }

      const localHash = hashContents(readFileSync(abs, "utf8"));
      const customized = localHash !== file.hash;

      // Compare against the template as it would be written for THIS
      // app: the recorded hash is of substituted content, so the raw
      // template never matches a file carrying a placeholder.
      const templateRel = targetToTemplate.get(file.path);
      let templateChanged = false;
      if (templateRel) {
        const templateHash = hashContents(
          substitute(
            readFileSync(path.join(options.templatesDir, templateRel), "utf8"),
            entry.variables
          )
        );
        templateChanged = templateHash !== file.hash;
      }

      report.items.push({
        feature,
        path: file.path,
        state: templateChanged
          ? customized
            ? "conflict"
            : "outdated"
          : customized
            ? "customized"
            : "current",
      });
    }
  }

  return report;
}

/** The feature's files the manifest has no record of: added to the template since. */
function newFiles(
  spec: { files: { target: string }[] } | undefined,
  recorded: { path: string }[]
): string[] {
  const known = new Set(recorded.map((file) => file.path));
  return (spec?.files ?? [])
    .map((file) => file.target)
    .filter((target) => !known.has(target));
}

export function formatUpgradeReport(r: UpgradeReport): string {
  if (r.items.length === 0) {
    return "No generated files recorded — nothing to upgrade.";
  }

  const label: Record<UpgradeItem["state"], string> = {
    current: "✓ up to date",
    outdated: "↑ template changed — safe to re-run `intelligo add`",
    conflict:
      "! template changed AND you edited it — `upgrade --diff <path>`, then merge or `upgrade --accept <path>`",
    customized: "= yours (template unchanged)",
    deleted: "✗ removed by you",
    new: "+ new in the template — `intelligo add` writes it",
  };

  const lines: string[] = [];
  for (const [feature, installed] of Object.entries(r.installedVersion)) {
    const latest = r.templateVersion[feature];
    lines.push(
      latest && latest !== installed
        ? `${feature}: ${installed} → ${latest}`
        : `${feature}: ${installed}`
    );
    for (const item of r.items.filter((i) => i.feature === feature)) {
      lines.push(`  ${label[item.state]}  ${item.path}`);
    }
  }
  return lines.join("\n");
}

/**
 * Non-zero only on conflicts. An outdated-but-untouched file is not a
 * problem to fail a build over; a file that changed on both sides is a
 * decision someone has to make.
 */
export function upgradeCheckExitCode(r: UpgradeReport): number {
  return r.items.some((i) => i.state === "conflict") ? 1 : 0;
}

/**
 * The file at `target` as the current template writes it for this app,
 * with the feature that owns it; null when no recorded feature does.
 */
function renderedTemplate(
  options: UpgradeCheckOptions,
  target: string
): { feature: string; contents: string } | null {
  const manifest = readManifest(options.appRoot);
  if (!manifest) return null;
  const catalogue = readCatalogue(options.templatesDir);
  for (const [feature, entry] of Object.entries(manifest.features)) {
    const file = catalogue[feature]?.files.find((f) => f.target === target);
    if (!file || !entry.files.some((f) => f.path === target)) continue;
    return {
      feature,
      contents: substitute(
        readFileSync(path.join(options.templatesDir, file.template), "utf8"),
        entry.variables
      ),
    };
  }
  return null;
}

/** A line diff, `-` for the app's lines and `+` for the template's. */
export function lineDiff(ours: string, theirs: string): string[] {
  const a = ours.split("\n");
  const b = theirs.split("\n");
  // Longest common subsequence table, filled from the end.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (
      j < b.length &&
      (i >= a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)
    ) {
      out.push(`+ ${b[j]}`);
      j++;
    } else {
      out.push(`- ${a[i]}`);
      i++;
    }
  }
  return out;
}

/**
 * `upgrade --diff <path>`: how the app's copy differs from what the
 * current template would write, changed lines with three of context.
 */
export function upgradeDiff(
  options: UpgradeCheckOptions,
  target: string
): string | null {
  const rendered = renderedTemplate(options, target);
  if (!rendered) return null;
  const abs = path.join(options.appRoot, target);
  const ours = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  const lines = lineDiff(ours, rendered.contents);
  const keep = lines.map((line, index) =>
    lines
      .slice(Math.max(0, index - 3), index + 4)
      .some((near) => !near.startsWith("  "))
  );
  const shown: string[] = [];
  lines.forEach((line, index) => {
    if (keep[index]) shown.push(line);
    else if (shown[shown.length - 1] !== "…") shown.push("…");
  });
  return [
    `--- ${target} (yours)`,
    `+++ ${target} (${rendered.feature} template)`,
    ...shown,
  ].join("\n");
}

/**
 * `upgrade --accept <path>`: the app keeps its copy, and the template's
 * current version is recorded as seen, so the file reads `customized`
 * instead of `conflict` until the template changes again.
 */
export function upgradeAccept(
  options: UpgradeCheckOptions,
  target: string
): "accepted" | "not_found" {
  const rendered = renderedTemplate(options, target);
  const manifest = readManifest(options.appRoot);
  if (!rendered || !manifest) return "not_found";
  const entry = manifest.features[rendered.feature]!;
  entry.files = entry.files.map((file) =>
    file.path === target
      ? { ...file, hash: hashContents(rendered.contents) }
      : file
  );
  writeManifest(options.appRoot, manifest);
  return "accepted";
}
