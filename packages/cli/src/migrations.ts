/**
 * Migration-chain inspection.
 *
 * Drizzle keeps two sources of truth: the `.sql` files on disk and
 * `meta/_journal.json`, which is what `drizzle-kit migrate` actually
 * reads. Nothing keeps them in step. In this repo the journal stopped
 * at entry 11 while 39 files accumulated, so `migrate` silently
 * applied a quarter of the chain and every environment was really
 * provisioned by `drizzle-kit push` from `schema.ts` instead — which
 * is how a migration shipped documenting a unique constraint on a
 * column no migration created.
 *
 * The drift is invisible until someone provisions a database from the
 * migrations, at which point it is a production incident rather than a
 * CI failure. These helpers make it a check.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

export type MigrationChain = {
  dir: string;
  /** `.sql` files present on disk, sorted by their numeric prefix. */
  files: string[];
  /** Tags drizzle-kit will actually apply, in order. */
  journalTags: string[];
  /** On disk but absent from the journal — `migrate` skips these. */
  unregistered: string[];
  /** In the journal but missing from disk — `migrate` fails on these. */
  missing: string[];
};

function tagOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

export function readMigrationChain(dir: string): MigrationChain {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let journalTags: string[] = [];
  try {
    const journal = JSON.parse(
      readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")
    ) as { entries?: JournalEntry[] };
    journalTags = (journal.entries ?? []).map((e) => e.tag);
  } catch {
    // No journal at all is itself the maximal drift: every file is
    // unregistered, which the caller reports.
    journalTags = [];
  }

  const registered = new Set(journalTags);
  const onDisk = new Set(files.map(tagOf));

  return {
    dir,
    files,
    journalTags,
    unregistered: files.map(tagOf).filter((t) => !registered.has(t)),
    missing: journalTags.filter((t) => !onDisk.has(t)),
  };
}

export type ChainProblem = { level: "error" | "warn"; message: string };

export function inspectMigrationChain(chain: MigrationChain): ChainProblem[] {
  const problems: ChainProblem[] = [];

  if (chain.files.length === 0) {
    problems.push({ level: "error", message: `No .sql files in ${chain.dir}` });
    return problems;
  }

  if (chain.missing.length > 0) {
    problems.push({
      level: "error",
      message:
        `Journal references ${chain.missing.length} migration(s) that are not on disk ` +
        `(drizzle-kit migrate will fail): ${chain.missing.join(", ")}`,
    });
  }

  if (chain.unregistered.length > 0) {
    problems.push({
      level: "error",
      message:
        `${chain.unregistered.length} of ${chain.files.length} migration files are not in ` +
        `meta/_journal.json, so drizzle-kit migrate skips them: ` +
        `${chain.unregistered.slice(0, 5).join(", ")}` +
        (chain.unregistered.length > 5 ? ", …" : ""),
    });
  }

  // Numbering problems. Two files sharing a prefix is worse than a
  // gap: `migrate` orders by tag, so which one runs first depends on
  // the rest of the filename rather than on intent.
  const numbers = chain.files
    .map((f) => Number.parseInt(f.slice(0, 4), 10))
    .filter((n) => Number.isFinite(n));

  const seen = new Map<number, number>();
  for (const n of numbers) seen.set(n, (seen.get(n) ?? 0) + 1);
  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([n]) => String(n).padStart(4, "0"));
  if (duplicates.length > 0) {
    problems.push({
      level: "warn",
      message: `Duplicate migration prefixes (apply order is filename-dependent): ${duplicates.join(", ")}`,
    });
  }

  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  for (let i = 1; i < unique.length; i++) {
    const prev = unique[i - 1]!;
    const cur = unique[i]!;
    if (cur > prev + 1) {
      problems.push({
        level: "warn",
        message: `Gap in migration numbering: ${String(prev).padStart(4, "0")} → ${String(cur).padStart(4, "0")}`,
      });
    }
  }

  return problems;
}
