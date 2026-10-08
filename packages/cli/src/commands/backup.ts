import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Copy `files` under `.intelligo/backup/<timestamp>/` before --force
 * replaces them, so a hand edit is never lost to a flag. Returns the
 * directory, relative to the app.
 */
export function backUp(appRoot: string, files: readonly string[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(".intelligo", "backup", stamp);
  for (const file of files) {
    const from = path.join(appRoot, file);
    if (!existsSync(from)) continue;
    const to = path.join(appRoot, dir, file);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return dir;
}

/**
 * Write `files` (app-relative path → contents) under
 * `.intelligo/backup/<timestamp>/`: the copies of files already
 * replaced on disk. Returns the directory, relative to the app.
 */
export function backUpContents(
  appRoot: string,
  files: ReadonlyMap<string, string>
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(".intelligo", "backup", stamp);
  for (const [file, contents] of files) {
    const to = path.join(appRoot, dir, file);
    mkdirSync(path.dirname(to), { recursive: true });
    writeFileSync(to, contents);
  }
  return dir;
}
