#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section for one version — the release notes.
 *
 * The release workflow feeds this to the GitHub release, and refuses
 * to publish a version that has no section: a release without notes
 * is a version nobody can tell apart from the last one.
 *
 *   node scripts/release-notes.mjs 1.0.0-beta.5
 */
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(2);
}

const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, "m");
const start = text.search(heading);
if (start === -1) {
  console.error(
    `CHANGELOG.md has no "## [${version}]" section — write the release notes before releasing.`
  );
  process.exit(1);
}
const rest = text.slice(start).replace(heading, "");
const end = rest.search(/^## \[/m);
const notes = (end === -1 ? rest : rest.slice(0, end)).trim();
if (!notes) {
  console.error(`CHANGELOG.md's "## [${version}]" section is empty.`);
  process.exit(1);
}
process.stdout.write(notes + "\n");
