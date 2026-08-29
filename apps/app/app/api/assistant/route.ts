/**
 * The whole point of the reference app, in one file.
 *
 * A generic assistant turn run inside the execution boundary:
 * entitlement decided, worst-case cost held, the model called, usage
 * settled, audit emitted. No Support, no private package, no framework
 * file edited to make it work.
 *
 * It runs through `runWithExecution` from @intelligo-dev/mastra — and this
 * app has no Mastra installed. `@mastra/core` is an optional peer that
 * the bridge never imports; the callable arrives as an argument, typed
 * structurally. So the bridge is not a Mastra adapter wearing a
 * package name: any framework whose result carries usage reaches the
 * boundary through it, which is the claim ADR-0003 makes and the thing
 * Phase 6 exists to check.
 *
 * The "model call" here is a stub — this app exercises the SaaS
 * boundary, not an AI product. Replacing `callModel` with a real
 * Mastra agent or an AI SDK `generateText` changes nothing else in
 * this file.
 */

import { requireWorkspace } from "@intelligo-dev/auth";
import { ExecutionRefusedError, runWithExecution } from "@intelligo-dev/mastra";

import { CAPABILITIES, composeIntelligo, executions } from "@/lib/intelligo";

export const maxDuration = 60;

type AssistantResult = {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

async function callModel(prompt: string): Promise<AssistantResult> {
  // Stand-in for a native framework call. Token counts are derived
  // from the prompt so the accounting path carries real numbers.
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
  return {
    text: `Echo: ${prompt}`,
    usage: { inputTokens, outputTokens: inputTokens * 2 },
    model: "reference/echo-1",
  };
}

export async function POST(request: Request) {
  composeIntelligo();

  let prompt: string;
  try {
    const body = (await request.json()) as { prompt?: unknown };
    if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
      return Response.json({ error: "prompt is required" }, { status: 400 });
    }
    prompt = body.prompt;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let context;
  try {
    context = await requireWorkspace();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // begin → run → settle, with the hold released on a throw. Written
    // by hand at each call site, the bug is a missing fail() in some
    // catch block and a credit hold that only expires ten minutes later.
    const result = await runWithExecution(
      {
        executions,
        workspaceId: context.workspace.id,
        userId: context.user.id,
        capability: CAPABILITIES.assistantMessage,
        model: "reference/echo-1",
      },
      () => callModel(prompt)
    );

    return Response.json({ text: result.text });
  } catch (error) {
    // A refusal is a distinct outcome, not a failure — the bridge
    // throws a typed error so it cannot be mistaken for an empty result.
    if (error instanceof ExecutionRefusedError) {
      return Response.json(
        { error: error.message, code: "QUOTA_EXCEEDED" },
        { status: 429 }
      );
    }
    return Response.json({ error: "assistant failed" }, { status: 500 });
  }
}
