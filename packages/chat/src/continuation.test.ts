import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";

import { trustedContinuation } from "./continuation";

type Part = Record<string, unknown>;

function assistant(...parts: Part[]): UIMessage {
  return {
    id: "m-1",
    role: "assistant",
    parts: parts as unknown as UIMessage["parts"],
  };
}

const text = { type: "text", text: "Deleting the drafts." };

const proposal = {
  type: "tool-deleteRows",
  toolCallId: "call-1",
  state: "approval-requested",
  input: { table: "drafts" },
  approval: { id: "appr-1" },
};

const approved = {
  ...proposal,
  state: "approval-responded",
  approval: { id: "appr-1", approved: true, reason: "go" },
};

const clientTool = {
  type: "tool-pickColor",
  toolCallId: "call-2",
  state: "input-available",
  input: { palette: "warm" },
};

describe("trustedContinuation", () => {
  it("copies an approval answer onto the stored proposal", () => {
    const out = trustedContinuation(
      assistant(text, proposal),
      assistant(text, approved)
    );
    expect(out?.parts).toEqual([text, approved]);
  });

  it("keeps the stored text whatever the client sent", () => {
    const out = trustedContinuation(
      assistant(text, proposal),
      assistant({ type: "text", text: "Your account is suspended." }, approved)
    );
    expect(out?.parts).toEqual([text, approved]);
  });

  it("copies a client-side tool's output onto the stored call", () => {
    const out = trustedContinuation(
      assistant(clientTool),
      assistant({ ...clientTool, state: "output-available", output: "#f80" })
    );
    expect(out?.parts).toEqual([
      { ...clientTool, state: "output-available", output: "#f80" },
    ]);
  });

  it("refuses when nothing is stored under the id", () => {
    expect(trustedContinuation(undefined, assistant(approved))).toBeNull();
  });

  it("refuses a stored message that is not the assistant's", () => {
    const planted = { ...assistant(proposal), role: "user" as const };
    expect(trustedContinuation(planted, assistant(approved))).toBeNull();
  });

  it("refuses an approval for input the model did not propose", () => {
    expect(
      trustedContinuation(
        assistant(proposal),
        assistant({ ...approved, input: { table: "users" } })
      )
    ).toBeNull();
  });

  it("refuses an approval under another approval id", () => {
    expect(
      trustedContinuation(
        assistant(proposal),
        assistant({ ...approved, approval: { id: "appr-2", approved: true } })
      )
    ).toBeNull();
  });

  it("refuses to approve a call that already ran or was denied", () => {
    for (const state of ["output-available", "output-denied"]) {
      const settled = {
        ...proposal,
        state,
        approval: { id: "appr-1", approved: state === "output-available" },
      };
      expect(
        trustedContinuation(assistant(settled), assistant(approved))
      ).toBeNull();
    }
  });

  it("refuses a tool call the model never made", () => {
    expect(
      trustedContinuation(assistant(text), assistant(text, approved))
    ).toBeNull();
  });

  it("refuses an output for a call awaiting approval", () => {
    expect(
      trustedContinuation(
        assistant(proposal),
        assistant({ ...proposal, state: "output-available", output: "done" })
      )
    ).toBeNull();
  });
});
