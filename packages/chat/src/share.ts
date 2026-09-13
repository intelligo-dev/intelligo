/**
 * What a public, read-only copy of a conversation may show.
 *
 * A shared page renders the same transcript the owner sees, minus what
 * was never meant for a stranger: the model's reasoning, the raw input
 * and output of every tool, provider metadata, token usage, transient
 * runtime parts, and any file URL — a stored attachment's URL is a
 * tenant-scoped, short-lived signed link, and an inline one is the
 * whole file. A product that wants a named tool's output on the shared
 * page (a report card, say) lists it in the policy.
 *
 * Pure: no I/O, no `ai` import at runtime.
 */

import type { UIMessage } from "ai";

export type SharePolicy = {
  /** Tool names whose `input`/`output` stay on the shared page. */
  keepToolOutput?: readonly string[];
  /** `data-*` part names (without the prefix) that stay. Default: `chat-task`, `chat-artifact`. */
  keepDataParts?: readonly string[];
  /** Keep reasoning parts. Default false. */
  keepReasoning?: boolean;
};

const DEFAULT_DATA_PARTS: readonly string[] = ["chat-task", "chat-artifact"];

function toolNameOf(part: Record<string, unknown>): string | null {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return null;
}

export function sanitizeForShare(
  messages: ReadonlyArray<UIMessage>,
  policy: SharePolicy = {}
): UIMessage[] {
  const keepTools = new Set(policy.keepToolOutput ?? []);
  const keepData = new Set(policy.keepDataParts ?? DEFAULT_DATA_PARTS);

  return messages.map((message) => {
    const parts: UIMessage["parts"] = [];
    for (const raw of message.parts) {
      const part = raw as unknown as Record<string, unknown>;
      const type = typeof part.type === "string" ? part.type : "";

      if (type === "reasoning") {
        if (policy.keepReasoning) parts.push(raw);
        continue;
      }
      if (type === "text" || type === "step-start") {
        const { providerMetadata: _pm, ...rest } = part;
        parts.push(rest as unknown as UIMessage["parts"][number]);
        continue;
      }
      if (type === "source-url" || type === "source-document") {
        const { providerMetadata: _pm, ...rest } = part;
        parts.push(rest as unknown as UIMessage["parts"][number]);
        continue;
      }
      if (type === "file") {
        parts.push({
          type: "file",
          mediaType: String(part.mediaType ?? "application/octet-stream"),
          ...(typeof part.filename === "string"
            ? { filename: part.filename }
            : {}),
          url: "",
        });
        continue;
      }
      const toolName = toolNameOf(part);
      if (toolName !== null) {
        const kept = keepTools.has(toolName);
        const {
          input,
          output,
          errorText: _e,
          providerMetadata: _pm,
          callProviderMetadata: _cpm,
          providerExecuted: _pe,
          approval: _a,
          ...rest
        } = part;
        parts.push({
          ...rest,
          ...(kept && input !== undefined ? { input } : {}),
          ...(kept && output !== undefined ? { output } : {}),
        } as unknown as UIMessage["parts"][number]);
        continue;
      }
      if (type.startsWith("data-")) {
        if (keepData.has(type.slice("data-".length))) parts.push(raw);
        continue;
      }
    }
    return { id: message.id, role: message.role, parts };
  });
}
