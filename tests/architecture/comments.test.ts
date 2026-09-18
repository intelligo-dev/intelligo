/**
 * A comment says what the code does, or why when the reason is not in the
 * code. History, tracker ids, provenance and labels are not that, so they
 * fail here: the published packages' source and the registry items, whose
 * comments every consumer reads.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PACKAGES_DIR, ROOT, walk } from "./tree";

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bPhase \d+/, why: "a planning phase" },
  { re: /\([A-Z]{2,8}-\d{2,3}\)/, why: "a tracker id" },
  { re: /\bv0\.\d+\b/, why: "a pre-1.0 milestone" },
  { re: /\bfirst product\b/i, why: "the product this grew with" },
  { re: /\bWave \d+\b/, why: "a refactoring wave" },
  { re: /\bPorted from\b|AI Elements|\bupstream\b/i, why: "where code came from" },
  { re: /Intelligo design system/, why: "a label" },
];

/** Comment text only: line comments, block comments and JSX comments. */
function comments(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(
    /\/\*[\s\S]*?\*\/|(?<![:"'`\\])\/\/[^\n]*/g
  )) {
    out.push(m[0]);
  }
  return out;
}

const files = walk(PACKAGES_DIR, (name) => /\.(tsx?|mjs|css)$/.test(name))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .filter((f) => !f.includes(`${path.sep}public${path.sep}`));

describe("comments say what the code does", () => {
  it("scans the published source and the registry", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("carry no history, tracker ids, provenance or labels", () => {
    const hits: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const comment of comments(source)) {
        for (const { re, why } of FORBIDDEN) {
          const match = comment.match(re);
          if (match) {
            hits.push(`${path.relative(ROOT, file)}: "${match[0]}" (${why})`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
