import { describe, expect, it, vi } from "vitest";

import { createArtifactWriter } from "./artifact-writer";
import type { ChatDataChunk } from "./parts";

function collect() {
  const chunks: ChatDataChunk[] = [];
  return {
    chunks,
    turn: { write: vi.fn((chunk: ChatDataChunk) => chunks.push(chunk)) },
  };
}

describe("createArtifactWriter", () => {
  it("opens the canvas on the first delta and streams every increment as transient", () => {
    const { chunks, turn } = collect();
    const doc = createArtifactWriter(turn, { kind: "text", title: "Report" });

    doc.append("Hello");
    doc.append(", world");

    expect(chunks.map((c) => c.type)).toEqual([
      "data-chat-artifact",
      "data-chat-artifact",
      "data-chat-artifact",
    ]);
    expect(chunks[0]).toMatchObject({
      id: doc.id,
      transient: true,
      data: { id: doc.id, kind: "text", title: "Report", status: "streaming" },
    });
    expect(chunks[1]!.data).toMatchObject({ delta: "Hello" });
    expect(chunks[2]!.data).toMatchObject({ delta: ", world" });
    expect(doc.content).toBe("Hello, world");
  });

  it("persists the ready part with the document id, never the deltas", () => {
    const { chunks, turn } = collect();
    const doc = createArtifactWriter(turn, {
      kind: "code",
      title: "main.py",
      id: "art-1",
    });
    doc.append("print(1)");
    doc.finish({ documentId: "doc-9", version: 2 });

    const ready = chunks[chunks.length - 1]!;
    expect(ready).toEqual({
      type: "data-chat-artifact",
      id: "art-1",
      data: {
        id: "art-1",
        kind: "code",
        title: "main.py",
        status: "ready",
        documentId: "doc-9",
        version: 2,
      },
    });
    expect("transient" in ready).toBe(false);
  });

  it("keeps content in the part only when asked", () => {
    const { chunks, turn } = collect();
    const doc = createArtifactWriter(turn, { kind: "text", title: "T" });
    doc.finish({ content: "inline" });
    expect(chunks[0]!.data).toMatchObject({
      status: "ready",
      content: "inline",
    });
  });

  it("marks a failure and then ignores further writes", () => {
    const { chunks, turn } = collect();
    const doc = createArtifactWriter(turn, { kind: "text", title: "T" });
    doc.fail(new Error("boom"));
    doc.append("late");
    doc.finish();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.data).toMatchObject({ status: "error", error: "boom" });
  });
});
