/**
 * The reference app's chat seam bindings.
 *
 * The transport's own tests cover what a turn does; this pins what the
 * reference app binds into it — the parts a fresh install would be
 * missing if this file regressed to the registry's defaults.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@intelligo-dev/core/documents", () => ({
  saveDocument: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import { DEFAULT_MODELS } from "@intelligo-dev/executions";

import { chatServerConfig } from "@/lib/chat-server-config";

describe("chat server config", () => {
  it("runs on a model the boundary can price", () => {
    // An unregistered id is refused at admission; a clean install must
    // stream, so the default has to be in the shipped catalogue.
    expect(DEFAULT_MODELS.map((m) => m.id)).toContain(
      chatServerConfig.model.defaultId
    );
  });

  it("gates on a feature key the plan catalogue registers", () => {
    expect(chatServerConfig.featureKey).toBe("chat");
  });

  it("allows more than one model step, so a tool call can be followed by a reply", () => {
    expect(chatServerConfig.maxSteps).toBeGreaterThan(1);
  });

  it("binds tools, without which the tool-renderer seam is unreachable", async () => {
    const tools = chatServerConfig.agent?.tools;
    expect(tools).toBeDefined();
    const bag =
      typeof tools === "function"
        ? await tools({
            workspaceId: "ws",
            userId: "u",
            conversationId: "c",
            request: new Request("http://app.test/api/chat"),
            body: {},
            conversation: null,
            trigger: undefined,
            write: () => {},
            updateMetadata: async () => {},
            addUsage: () => {},
          })
        : tools;
    expect(Object.keys(bag ?? {})).toContain("saveArtifact");
  });

  it("answers refusals from this item's own message keys", async () => {
    const t = await chatServerConfig.messages!(
      new Request("http://app.test/api/chat")
    );
    expect(t("featureGated")).toBe("route.featureGated");
  });
});
