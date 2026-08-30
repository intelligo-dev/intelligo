/**
 * `intelligo upgrade --check`
 *
 * Reports what a template upgrade would do, and does nothing. The
 * promise in ADR-0002 is that dependency upgrades never overwrite
 * consumer source, so the interesting output is not "these files
 * changed upstream" but "these changed upstream AND you have edited
 * them" — the set where the consumer has to make a decision.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readCatalogue, substitute } from "./add.js";
import { hashContents, readManifest, type Manifest } from "../manifest.js";

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
   */
  state: "current" | "outdated" | "conflict" | "customized" | "deleted";
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
      // template never matched for any file carrying a placeholder.
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

export function formatUpgradeReport(r: UpgradeReport): string {
  if (r.items.length === 0) {
    return "No generated files recorded — nothing to upgrade.";
  }

  const label: Record<UpgradeItem["state"], string> = {
    current: "✓ up to date",
    outdated: "↑ template changed — safe to re-run `intelligo add`",
    conflict: "! template changed AND you edited it — review the diff",
    customized: "= yours (template unchanged)",
    deleted: "✗ removed by you",
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
