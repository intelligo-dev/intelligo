import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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
