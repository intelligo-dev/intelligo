/**
 * Your assistant endpoint, generated once and now yours.
 *
 * The shape is the point: whatever model call you put in the middle,
 * it runs inside an execution — entitlement decided, worst-case cost
 * held, usage settled, audit emitted. Swap `callModel` for a Mastra
 * agent, an AI SDK call, or anything else and nothing around it
 * changes.
 */

import { isAuthGuardError, requireWorkspace } from "@intelligo-dev/auth";

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
  } catch (error) {
    // Only a refused guard is a 401; anything else (the database down)
    // is the server's failure, not the caller's.
    if (!isAuthGuardError(error)) throw error;
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await executions.begin({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    capability: CAPABILITIES.assistantMessage,
    model: "example/echo-1",
  });

  if (!run.allowed) {
    // 503 for what only the deployment can fix (a model with no
    // registered price, billing not configured); 402 for what the
    // workspace can fix by paying. `run.reason` is for the log.
    const unavailable =
      run.code === "unknown_model" || run.code === "billing_not_configured";
    console.error("[assistant] refused:", run.code, run.reason);
    return Response.json(
      {
        error: unavailable ? "assistant unavailable" : "quota exceeded",
        code: unavailable ? "UNAVAILABLE" : "QUOTA_EXCEEDED",
      },
      { status: unavailable ? 503 : 402 }
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
