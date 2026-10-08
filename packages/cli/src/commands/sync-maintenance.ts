/**
 * The registry-page chores beside install: comparing a file with what
 * the registry ships, and removing an item.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { hashContents, readManifest, writeManifest } from "../manifest.js";
import { asInstalled, registryClosure } from "../registry-bundle.js";
import { installOrder, shippedFiles, type SyncContext } from "./sync.js";
import { lineDiff } from "./upgrade-check.js";
import { backUp } from "./backup.js";

/**
 * `sync --diff <path>`: a seam (or any shipped file) against what this
 * release's registry ships, `-` for the app's lines and `+` for the
 * registry's.
 */
export function syncDiff(
  target: string,
  items: readonly string[],
  context: SyncContext
): string | null {
  const shipped = shippedFiles(context, items).files.find(
    (f) => f.target === target
  );
  if (!shipped) return null;
  const abs = path.join(context.appRoot, target);
  const ours = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  return [
    `--- ${target} (yours)`,
    `+++ ${target} (registry ${context.frameworkVersion}, ${shipped.item})`,
    ...lineDiff(asInstalled(ours), asInstalled(shipped.content)),
  ].join("\n");
}

export type RemoveResult =
  | {
      status: "removed";
      deleted: string[];
      keptSeams: string[];
      /** Where the deleted files edited by hand were copied first. */
      backedUp?: { dir: string; files: string[] };
    }
  | { status: "not_installed" }
  | { status: "needed"; by: string[] };

/**
 * `intelligo remove <item>`: delete the files only this item ships and
 * forget it in the manifest. A seam is the app's and stays; an item
 * another kept item needs is refused. A file edited since it was
 * installed is copied under `.intelligo/backup/` before it goes.
 */
export function removeItem(name: string, context: SyncContext): RemoveResult {
  const manifest = readManifest(context.appRoot);
  const kept = manifest?.registry?.items ?? [];
  if (!manifest?.registry || !kept.includes(name)) {
    return { status: "not_installed" };
  }
  const others = kept.filter((item) => item !== name);
  const needing = others.filter(
    (item) =>
      installOrder([item], context.requires).includes(name) ||
      registryClosure(context.registryDir, [item]).includes(name)
  );
  if (needing.length > 0) return { status: "needed", by: needing };

  const stillShipped = new Set(
    shippedFiles(context, others).files.map((f) => f.target)
  );
  const seams = context.requires.seams ?? {};
  const recorded = manifest.registry.files ?? {};
  const doomed: string[] = [];
  const edited: string[] = [];
  const keptSeams: string[] = [];
  for (const { target, content } of shippedFiles(context, [name]).files) {
    if (stillShipped.has(target)) continue;
    const abs = path.join(context.appRoot, target);
    if (!existsSync(abs)) continue;
    if (target in seams) {
      keptSeams.push(target);
      continue;
    }
    const current = hashContents(asInstalled(readFileSync(abs, "utf8")));
    if (
      current !== recorded[target] &&
      current !== hashContents(asInstalled(content))
    ) {
      edited.push(target);
    }
    doomed.push(target);
  }
  const backedUp =
    edited.length > 0
      ? { dir: backUp(context.appRoot, edited), files: edited }
      : undefined;
  const deleted: string[] = [];
  for (const target of doomed) {
    rmSync(path.join(context.appRoot, target));
    deleted.push(target);
  }
  const files = { ...manifest.registry.files };
  for (const target of deleted) delete files[target];
  writeManifest(context.appRoot, {
    ...manifest,
    registry: { ...manifest.registry, items: others, files },
  });
  return {
    status: "removed",
    deleted,
    keptSeams,
    ...(backedUp ? { backedUp } : {}),
  };
}

export function formatRemoveResult(name: string, result: RemoveResult): string {
  if (result.status === "not_installed") {
    return `✗ ${name} is not an item this app keeps in sync.`;
  }
  if (result.status === "needed") {
    return `✗ ${result.by.join(", ")} need(s) ${name}; remove that first.`;
  }
  return [
    `✓ Removed ${name}: ${result.deleted.length} file(s) deleted.`,
    ...(result.backedUp
      ? [
          `Edited by hand, so copied to ${result.backedUp.dir} first:`,
          ...result.backedUp.files.map((f) => `  ${f}`),
        ]
      : []),
    ...(result.keptSeams.length > 0
      ? [
          "Kept, as yours (seams) — delete them if nothing else uses them:",
          ...result.keptSeams.map((f) => `  ${f}`),
        ]
      : []),
    "Its messages and any import of its files are yours to remove.",
  ].join("\n");
}
