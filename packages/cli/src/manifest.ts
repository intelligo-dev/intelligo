/**
 * Generated-source manifest.
 *
 * Intelligo generates starting source into the consumer's repository
 * and then stops owning it (ADR-0002). That promise needs a mechanism,
 * because "never overwrite a customized file" requires knowing which
 * files were generated, from which template version, and whether the
 * consumer has since edited them.
 *
 * The manifest records a content hash per generated file at the moment
 * it was written. A file whose hash still matches was not touched and
 * can be re-generated safely; one whose hash differs is the consumer's
 * code now, and an upgrade may only show them a diff.
 *
 * Deliberately not a lockfile of package versions: it tracks template
 * provenance, not dependencies.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const MANIFEST_FILE = "intelligo.manifest.json";

export type GeneratedFile = {
  /** Path relative to the consumer application root. */
  path: string;
  /** sha256 of the contents Intelligo wrote. */
  hash: string;
};

export type FeatureEntry = {
  templateVersion: string;
  files: GeneratedFile[];
  /**
   * Placeholder substitutions the files were generated with
   * (`__APP_NAME__` → "acme"). Recorded so an upgrade check can hash the
   * template *as it would be written for this app* — hashing the raw
   * template made every substituted file look permanently outdated.
   */
  variables?: Record<string, string>;
};

export type Manifest = {
  schemaVersion: 1;
  frameworkVersion: string;
  features: Record<string, FeatureEntry>;
};

export function hashContents(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function emptyManifest(frameworkVersion: string): Manifest {
  return { schemaVersion: 1, frameworkVersion, features: {} };
}

export function readManifest(appRoot: string): Manifest | null {
  const file = path.join(appRoot, MANIFEST_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

export function writeManifest(appRoot: string, manifest: Manifest): void {
  writeFileSync(
    path.join(appRoot, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

/**
 * What happened to a generated file since it was written.
 *
 * `customized` is the state the whole mechanism exists to detect: the
 * consumer owns that file now, and an upgrade must not touch it.
 */
export type FileState = "unchanged" | "customized" | "deleted";

export type FileStatus = {
  path: string;
  state: FileState;
};

export function inspectFile(appRoot: string, file: GeneratedFile): FileStatus {
  const abs = path.join(appRoot, file.path);
  if (!existsSync(abs)) return { path: file.path, state: "deleted" };

  const current = hashContents(readFileSync(abs, "utf8"));
  return {
    path: file.path,
    state: current === file.hash ? "unchanged" : "customized",
  };
}

export function inspectFeature(
  appRoot: string,
  entry: FeatureEntry
): FileStatus[] {
  return entry.files.map((f) => inspectFile(appRoot, f));
}

/**
 * Record a feature's generated files, replacing any previous entry for
 * the same feature — re-generating is how a consumer accepts a new
 * template version, and the recorded hashes must then describe what is
 * actually on disk.
 */
export function recordFeature(
  manifest: Manifest,
  feature: string,
  templateVersion: string,
  files: GeneratedFile[],
  variables?: Record<string, string>
): Manifest {
  return {
    ...manifest,
    features: {
      ...manifest.features,
      [feature]: variables
        ? { templateVersion, files, variables }
        : { templateVersion, files },
    },
  };
}
