/**
 * What `intelligo sync` does so an install cannot lose the app's files.
 *
 * - The seams and message files the app owns are replaced on disk by
 *   `shadcn add --overwrite` and written back afterwards. Until then
 *   they are copied under `.intelligo/sync-restore/` and put back on
 *   SIGINT or SIGTERM; a sync that ends any other way without putting
 *   them back leaves that copy, and the next sync refuses to run until
 *   it is dealt with.
 * - The shadcn items Intelligo's depend on (`utils`, `card`…) come from
 *   shadcn's registry, not this one, so no check covers them. The files
 *   they live in are read before the install, and a copy the install
 *   replaced is saved under `.intelligo/backup/` unless it was the
 *   scaffold's, untouched.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { hashContents, readManifest } from "../manifest.js";
import { SCAFFOLD_FEATURE } from "./sync-scaffold.js";

/** Where the app's own files wait while an install runs, relative to the app. */
export const RESTORE_DIR = path.join(".intelligo", "sync-restore");

/** Copy `files` (app-relative path → contents) under `RESTORE_DIR`. */
export function writeRestorePoint(
  appRoot: string,
  files: ReadonlyMap<string, string>
): void {
  clearRestorePoint(appRoot);
  for (const [file, contents] of files) {
    const to = path.join(appRoot, RESTORE_DIR, file);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, contents);
  }
}

export function clearRestorePoint(appRoot: string): void {
  rmSync(path.join(appRoot, RESTORE_DIR), { recursive: true, force: true });
}

/** The files an unfinished sync left under `RESTORE_DIR`, or none. */
export function leftRestorePoint(appRoot: string): string[] {
  const root = path.join(appRoot, RESTORE_DIR);
  return existsSync(root) ? listFiles(root).sort() : [];
}

/** Write `files` back where they came from. */
export function writeBack(
  appRoot: string,
  files: ReadonlyMap<string, string>
): void {
  for (const [file, contents] of files) {
    const to = path.join(appRoot, file);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, contents);
  }
}

/**
 * Run `restore` and exit when the process is interrupted, until the
 * returned function is called. `exit` is the process's own unless a
 * test passes one.
 */
export function onInterrupt(
  restore: () => void,
  exit: (code: number) => void = (code) => process.exit(code)
): () => void {
  const handle = (signal: NodeJS.Signals) => {
    dispose();
    restore();
    exit(signal === "SIGINT" ? 130 : 143);
  };
  const dispose = () => {
    process.off("SIGINT", handle);
    process.off("SIGTERM", handle);
  };
  process.on("SIGINT", handle);
  process.on("SIGTERM", handle);
  return dispose;
}

/**
 * The directories shadcn writes its own items into, from components.json
 * `aliases` (`@/components/ui` → `components/ui`).
 */
export function upstreamDirs(
  aliases: Record<string, string> | undefined
): string[] {
  const fallback = ["components/ui", "lib", "hooks"];
  const dirs = (["ui", "lib", "hooks"] as const)
    .map((key) => aliases?.[key])
    .filter((alias): alias is string => typeof alias === "string")
    .map((alias) => alias.replace(/^[@~]\//, ""))
    .filter((dir) => dir.length > 0 && !dir.startsWith("."));
  return dirs.length > 0 ? dirs : fallback;
}

/**
 * The files under `dirs` as they are now, and afterwards the ones an
 * install changed — their contents before it — leaving out `exclude`
 * (files a check already covers) and scaffold files nobody edited.
 */
export function snapshotUpstream(
  appRoot: string,
  dirs: readonly string[],
  exclude: ReadonlySet<string>
): { replaced: () => Map<string, string> } {
  const scaffold = new Map(
    (readManifest(appRoot)?.features[SCAFFOLD_FEATURE]?.files ?? []).map(
      (f) => [f.path, f.hash]
    )
  );
  const before = new Map<string, string>();
  for (const dir of dirs) {
    const abs = path.join(appRoot, dir);
    if (!existsSync(abs)) continue;
    for (const file of listFiles(abs)) {
      const rel = path.posix.join(dir, file);
      if (exclude.has(rel)) continue;
      const contents = readFileSync(path.join(abs, file), "utf8");
      if (scaffold.get(rel) === hashContents(contents)) continue;
      before.set(rel, contents);
    }
  }
  return {
    replaced: () =>
      new Map(
        [...before].filter(([rel, contents]) => {
          const abs = path.join(appRoot, rel);
          return existsSync(abs) && readFileSync(abs, "utf8") !== contents;
        })
      ),
  };
}

/** Files under `dir`, as `/`-separated paths relative to it. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const abs = path.join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      for (const inner of listFiles(abs)) out.push(`${name}/${inner}`);
    } else if (stat.isFile()) {
      out.push(name);
    }
  }
  return out;
}
