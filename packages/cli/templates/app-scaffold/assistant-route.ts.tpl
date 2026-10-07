/**
 * Your assistant endpoint, generated once and now yours.
 *
 * The shape is the point: whatever model call you put in the middle,
 * it runs inside an execution — entitlement decided, worst-case cost
 * held, usage settled, audit emitted. Swap `callModel` for a Mastra
 * agent, an AI SDK call, or anything else and nothing around it
 * changes.
 */

import {
  executionRefusalResponse,
  withWorkspace,
} from "@intelligo-dev/next/route";

import { CAPABILITIES, composeIntelligo, executions } from "@/lib/intelligo";

export const maxDuration = 60;

async function callModel(prompt: string) {
  // Your AI framework's call goes here.
  const inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
  return {
    text: `Echo: ${prompt}`,
    usage: { inputTokens, outputTokens: inputTokens * 2 },
    model: "example/echo-1",
  };
}

// withWorkspace answers 401/403 for a refused guard and lets any other
// failure (the database down) through as the server's.
export const POST = withWorkspace(async (request, context) => {
  composeIntelligo();

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
  } | null;
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const run = await executions.begin({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    capability: CAPABILITIES.assistantMessage,
    model: "example/echo-1",
  });

  if (!run.allowed) {
    // The engine's reason is for the log; the caller gets a code.
    console.error("[assistant] refused:", run.code, run.reason);
    return executionRefusalResponse(run);
  }

  try {
    const result = await callModel(body.prompt);
    await run.complete({ usage: result.usage, model: result.model });
    return Response.json({ text: result.text });
  } catch (error) {
    await run.fail({ error });
    return Response.json({ error: "assistant failed" }, { status: 500 });
  }
});
