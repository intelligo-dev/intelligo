/**
 * The privacy page names a fact's category from the item's messages
 * and shows a value as a person reads it: a string, or an object's
 * `label`.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import en from "../base/privacy-settings/messages/en.json";

vi.mock("next-intl", () => {
  const lookup = (key: string): unknown =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        en
      );
  const t = Object.assign(
    (key: string) => {
      const value = lookup(key);
      return typeof value === "string" ? value : key;
    },
    { has: (key: string) => typeof lookup(key) === "string" }
  );
  return { useTranslations: () => t };
});
vi.mock("sonner", () => ({ toast: { error: () => {} } }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/actions/privacy", () => ({ deleteFact: async () => ({}) }));

import { FactList } from "../base/privacy-settings/components/fact-list";

const fact = (overrides: Record<string, unknown>) =>
  ({
    id: "f1",
    userId: "u1",
    workspaceId: "w1",
    category: "skill",
    key: "k",
    value: "SQL",
    confidence: 0.9,
    importance: 5,
    createdAt: new Date(0),
    ...overrides,
  }) as never;

describe("FactList", () => {
  it("names categories from the messages, and an unknown one in Title Case", () => {
    const html = renderToStaticMarkup(
      <FactList
        initialFacts={[
          fact({ id: "a", category: "goal" }),
          fact({ id: "b", category: "life_event" }),
        ]}
      />
    );
    expect(html).toContain("Goals");
    expect(html).toContain("Life Event");
  });

  it("shows a string value, or an object's label, never the raw object", () => {
    const html = renderToStaticMarkup(
      <FactList
        initialFacts={[
          fact({ id: "a", value: "Ulaanbaatar" }),
          fact({ id: "b", value: { label: "Data engineer", level: "senior" } }),
        ]}
      />
    );
    expect(html).toContain("Ulaanbaatar");
    expect(html).toContain("Data engineer");
    expect(html).not.toContain("senior");
  });
});
