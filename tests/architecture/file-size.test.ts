/**
 * How long a framework file, and a function inside it, may get.
 *
 * **Code lines, never raw lines.** A line any comment touches does not
 * count, so a rule about length never argues for deleting a doc
 * comment. Comments are found with the compiler's own scanner; a
 * brace-matching regex breaks on the first multi-line arrow const.
 *
 * **Functions are measured too, and matter more.** Length is a proxy;
 * one long function is the thing itself. The measured distribution is
 * p50 7, p90 38, p95 57 — so 150 is far out on the tail.
 *
 * **A ports factory is measured by its longest member, not its own
 * span.** A body of declarations plus a return of them is the "ports
 * over dependencies" pattern the composition root requires, and a size
 * rule must not condemn it. A body that is a pipeline
 * (`createChatHandler`) is not a factory by this test.
 *
 * **The exemption map may only shrink.** A file that outgrows its
 * entry fails, and so does one that has been fixed and is still
 * listed. Entries carry the argument, not just the number.
 *
 * Scope is the published packages only: `packages/registry` is
 * consumer-owned source installed verbatim, `apps/*` is generated from
 * it, and a test file is a list of cases that should stay exhaustive.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PACKAGES_DIR, ROOT, listPublishedWorkspaces, walk } from "./tree";

/**
 * Code lines a file may have before it needs an argument.
 *
 * 500, against a measured p95 of 331. A lower limit catches files whose
 * functions are all short, and a map half-filled with non-defects is
 * how a rule stops being read.
 */
const FILE_LIMIT = 500;

/** Code lines one function may have. p95 across the tree is 57. */
const FUNCTION_LIMIT = 150;

/**
 * Files over the limit today, each with the reason it is still here.
 * Delete an entry when the file is split; the test fails if you do not.
 */
const FILE_EXEMPTIONS: Record<string, string> = {
  "packages/chat/src/handler.ts":
    "the transport's whole pipeline in one function — parse, admit, prepare, stream, settle, persist. Being split leaves-first; the settlement closure graph goes last, and only behind a mutation score that proves the suite would notice.",
  "packages/billing/src/quota.ts":
    "admission, settlement and reporting in one module. The seam is already cut — `quota.test.ts` and `quota-settlement.test.ts` exist as separate suites — so this splits into three without touching a test.",
};

/**
 * Functions over the limit today. A ports factory is not here: it is
 * measured by its longest member instead, which is a rule rather than
 * an exemption.
 */
const FUNCTION_EXEMPTIONS: Record<string, string> = {
  "packages/chat/src/handler.ts createChatHandler":
    "the closure that holds the transport's helpers and its two verbs. Shrinks as the leaves move out.",
  "packages/chat/src/handler.ts POST":
    "one turn, start to finish. Every early return is a typed refusal and the tail is a single stream closure sharing `captured`, `writerSlot` and `run` — splitting that sharing is a redesign of the one path where a silent change costs money.",
  "packages/executions/src/lifecycle.ts begin":
    "admission: entitlement, the hold, the row and the handle. The handle is the part worth extracting.",
};

/** Every line index a comment touches, so a span can be measured in code. */
function commentLines(text: string, source: ts.SourceFile): Set<number> {
  const lines = new Set<number>();
  const scanner = ts.createScanner(
    ts.ScriptTarget.ES2020,
    false,
    ts.LanguageVariant.JSX,
    text
  );
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const start = source.getLineAndCharacterOfPosition(
        scanner.getTokenStart()
      ).line;
      const end = source.getLineAndCharacterOfPosition(
        scanner.getTokenEnd()
      ).line;
      for (let line = start; line <= end; line++) lines.add(line);
    }
    token = scanner.scan();
  }
  return lines;
}

type Measured = {
  file: string;
  lines: number;
  functions: Array<{ name: string; lines: number }>;
};

function isFunctionLike(node: ts.Node): node is ts.SignatureDeclaration & {
  body?: ts.Block;
} {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

/**
 * A ports factory: a body that declares things and returns them. Its
 * length is the sum of its members, so the member is what to measure.
 */
function isPortsFactory(node: ts.Node): boolean {
  const body = (node as { body?: ts.Node }).body;
  if (!body || !ts.isBlock(body)) return false;
  const statements = body.statements;
  const last = statements[statements.length - 1];
  if (!last || !ts.isReturnStatement(last)) return false;
  const rest = statements.slice(0, -1);
  if (rest.length === 0) return false;
  return rest.every(
    (statement) =>
      ts.isFunctionDeclaration(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
  );
}

function measure(absolute: string): Measured {
  const text = readFileSync(absolute, "utf8");
  const source = ts.createSourceFile(
    absolute,
    text,
    ts.ScriptTarget.ES2020,
    true
  );
  const comments = commentLines(text, source);
  const lines = text.split("\n");

  const codeLinesIn = (node: ts.Node): number => {
    const start = source.getLineAndCharacterOfPosition(
      node.getStart(source)
    ).line;
    const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
    let count = 0;
    for (let line = start; line <= end; line++) {
      if (lines[line]?.trim() && !comments.has(line)) count++;
    }
    return count;
  };

  const functions: Array<{ name: string; lines: number }> = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node) && node.body && !isPortsFactory(node)) {
      const named = node as { name?: ts.Node };
      functions.push({
        name: named.name?.getText(source) ?? "(anonymous)",
        lines: codeLinesIn(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  let fileLines = 0;
  lines.forEach((line, index) => {
    if (line.trim() && !comments.has(index)) fileLines++;
  });

  return { file: path.relative(ROOT, absolute), lines: fileLines, functions };
}

const measured: Measured[] = listPublishedWorkspaces(PACKAGES_DIR)
  .flatMap((pkg) =>
    walk(
      path.join(PACKAGES_DIR, pkg, "src"),
      (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
    )
  )
  .map(measure);

describe("file size", () => {
  it("measures something, so the rules below are not vacuous", () => {
    expect(measured.length).toBeGreaterThan(100);
  });

  it("has no file over the limit that is not accounted for", () => {
    const offenders = measured
      .filter(
        (file) => file.lines > FILE_LIMIT && !(file.file in FILE_EXEMPTIONS)
      )
      .map((file) => `${file.file} (${file.lines} code lines)`);

    expect(
      offenders,
      `over ${FILE_LIMIT} code lines with no entry in FILE_EXEMPTIONS — split it, or add the file with the argument for why it stays`
    ).toEqual([]);
  });

  it("lists no file that has since been split, so the map only shrinks", () => {
    const byPath = new Map(measured.map((file) => [file.file, file.lines]));
    const stale = Object.keys(FILE_EXEMPTIONS)
      .filter((file) => (byPath.get(file) ?? 0) <= FILE_LIMIT)
      .map((file) => `${file} (now ${byPath.get(file) ?? 0})`);

    expect(
      stale,
      "these are under the limit now — delete their FILE_EXEMPTIONS entries"
    ).toEqual([]);
  });
});

describe("function size", () => {
  const all = measured.flatMap((file) =>
    file.functions.map((fn) => ({
      key: `${file.file} ${fn.name}`,
      lines: fn.lines,
    }))
  );

  it("has no function over the limit that is not accounted for", () => {
    const offenders = all
      .filter(
        (fn) => fn.lines > FUNCTION_LIMIT && !(fn.key in FUNCTION_EXEMPTIONS)
      )
      .map((fn) => `${fn.key} (${fn.lines} code lines)`);

    expect(
      offenders,
      `over ${FUNCTION_LIMIT} code lines with no entry in FUNCTION_EXEMPTIONS — a ports factory is measured by its longest member, so this is a function that genuinely does several jobs`
    ).toEqual([]);
  });

  it("lists no function that has since been split, so the map only shrinks", () => {
    const longest = new Map<string, number>();
    for (const fn of all) {
      longest.set(fn.key, Math.max(longest.get(fn.key) ?? 0, fn.lines));
    }
    const stale = Object.keys(FUNCTION_EXEMPTIONS)
      .filter((key) => (longest.get(key) ?? 0) <= FUNCTION_LIMIT)
      .map((key) => `${key} (now ${longest.get(key) ?? 0})`);

    expect(
      stale,
      "these are under the limit now — delete their FUNCTION_EXEMPTIONS entries"
    ).toEqual([]);
  });

  it("measures a ports factory by its longest member", () => {
    // The carve-out is load-bearing: without it the rule condemns
    // the composition root's factory pattern. `createTeamService` is
    // long, but declarations and a return, and must not be reported;
    // `createChatHandler` is longer still and must be, because its body
    // is a pipeline.
    const keys = all.map((fn) => fn.key);
    expect(keys).not.toContain(
      "packages/auth/src/team/service.ts createTeamService"
    );
    expect(keys).toContain("packages/chat/src/handler.ts createChatHandler");
  });
});
