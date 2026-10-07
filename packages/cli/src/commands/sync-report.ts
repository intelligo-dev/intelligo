/**
 * What `sync --check` found, as an exit code and as text.
 */

import type { SyncFileState, SyncReport } from "./sync.js";

const FAILING: ReadonlySet<SyncFileState> = new Set([
  "outdated",
  "edited",
  "differs",
  "missing",
  "messages-behind",
  "locale-behind",
]);

export function syncCheckExitCode(report: SyncReport): number {
  return report.entries.some((e) => FAILING.has(e.state)) ? 1 : 0;
}

export function formatSyncReport(report: SyncReport): string {
  const counts = new Map<SyncFileState, number>();
  for (const e of report.entries) {
    counts.set(e.state, (counts.get(e.state) ?? 0) + 1);
  }
  const lines = [
    `Registry ${report.version}: ${report.items.length} item(s), ${report.entries.length} file(s) — ` +
      [...counts].map(([state, n]) => `${n} ${state}`).join(", "),
  ];
  const HINT: Partial<Record<SyncFileState, string>> = {
    outdated: "a newer registry version — `intelligo sync` replaces it",
    edited:
      "edited by hand — move the change into a seam, or ask for one upstream",
    differs: "not what the registry ships, and never synced",
    missing: "not installed",
    "messages-behind": "lacks registry keys — `intelligo sync` adds them",
    "locale-behind":
      "lacks keys the app's English copy has — translate them; sync never writes another locale",
  };
  const orphaned = report.entries.filter((e) => e.state === "orphaned");
  if (orphaned.length > 0) {
    lines.push(
      "",
      "orphaned (an earlier release shipped it, this one does not — delete it once nothing imports it):"
    );
    for (const e of orphaned) lines.push(`  ${e.path}`);
  }
  const changedSeams = report.entries.filter((e) => e.state === "seam-changed");
  if (changedSeams.length > 0) {
    lines.push(
      "",
      "seam-changed (the registry's default for this seam changed; yours is kept — `intelligo sync --diff <path>` shows what is new):"
    );
    for (const e of changedSeams) lines.push(`  ${e.path}  [${e.item}]`);
  }
  for (const state of FAILING) {
    const group = report.entries.filter((e) => e.state === state);
    if (group.length === 0) continue;
    lines.push("", `${state} (${HINT[state]}):`);
    for (const e of group) {
      const keys = e.missingKeys
        ? ` — ${e.missingKeys.slice(0, 5).join(", ")}${e.missingKeys.length > 5 ? `, +${e.missingKeys.length - 5}` : ""}`
        : "";
      lines.push(`  ${e.path}  [${e.item}]${keys}`);
    }
  }
  if (!report.entries.some((e) => FAILING.has(e.state))) {
    lines.push("✓ every installed file is the registry's, seams aside");
  }
  return lines.join("\n");
}
