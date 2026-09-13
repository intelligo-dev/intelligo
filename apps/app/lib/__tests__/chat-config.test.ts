/**
 * The chat seam's starters are message keys, resolved namespace-less
 * against the whole message tree. A key with no message behind it is
 * not a type error and not a build error — it is a MISSING_MESSAGE in
 * the console and a raw key on the empty-conversation card, which is
 * exactly how the four starters here shipped once.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { chatConfig } from "@/lib/chat-config";

const MESSAGES_DIR = path.resolve(__dirname, "../../messages/en");

/** The merged `en` message tree, the way i18n/request.ts assembles it. */
function messages(): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const file of readdirSync(MESSAGES_DIR)) {
    if (!file.endsWith(".json")) continue;
    tree[file.replace(/\.json$/, "")] = JSON.parse(
      readFileSync(path.join(MESSAGES_DIR, file), "utf8")
    );
  }
  return tree;
}

function resolve(tree: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    return node && typeof node === "object"
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, tree);
}

describe("chatConfig.starters", () => {
  it("names only message keys that resolve", () => {
    const tree = messages();
    const missing = (chatConfig.starters ?? []).filter(
      (key) => typeof resolve(tree, key) !== "string"
    );
    expect(missing, "starter keys with no message behind them").toEqual([]);
  });

  it("keeps a starter that exercises the stub's tool path", () => {
    // lib/chat-model.ts calls saveArtifact for a message that starts
    // with "save" — one click from an empty chat to a written artifact.
    const tree = messages();
    const texts = (chatConfig.starters ?? []).map((key) =>
      String(resolve(tree, key))
    );
    expect(texts.some((text) => /^\s*save\b/i.test(text))).toBe(true);
  });
});
