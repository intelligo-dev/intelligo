/**
 * Your assistant endpoint, generated once and now yours.
 *
 * The shape is the point: whatever model call you put in the middle,
 * it runs inside an execution — entitlement decided, worst-case cost
 * held, usage settled, audit emitted. Swap `callModel` for a Mastra
 * agent, an AI SDK call, or anything else and nothing around it
 * changes.
 */

import { requireWorkspace } from "@intelligo-dev/auth";

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

export async function POST(request: Request) {
  composeIntelligo();

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown;
  } | null;
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  let context;
  try {
    context = await requireWorkspace();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await executions.begin({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    capability: CAPABILITIES.assistantMessage,
    model: "example/echo-1",
  });

  if (!run.allowed) {
    return Response.json(
      { error: run.reason ?? "quota exceeded", code: "QUOTA_EXCEEDED" },
      { status: 429 }
    );
  }

  try {
    const result = await callModel(body.prompt);
    await run.complete({ usage: result.usage, model: result.model });
    return Response.json({ text: result.text });
  } catch (error) {
    await run.fail({ error });
    return Response.json({ error: "assistant failed" }, { status: 500 });
  }
}
