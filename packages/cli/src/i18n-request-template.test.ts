/**
 * The scaffold's `i18n/request.ts`, run as a consumer gets it: a locale
 * that has not translated every namespace or key still renders, in the
 * default locale's words, instead of throwing on the first missing key.
 */

import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));
vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: async () => new Headers(),
  resolveTimeZone: () => "UTC",
}));

const TEMPLATE = path.resolve(
  __dirname,
  "..",
  "templates/app-scaffold/i18n-request.ts.tpl"
);

let app: string;

function writeMessages(locale: string, namespace: string, body: object) {
  mkdirSync(path.join(app, "messages", locale), { recursive: true });
  writeFileSync(
    path.join(app, "messages", locale, `${namespace}.json`),
    JSON.stringify(body)
  );
}

type RequestConfig = (params: {
  requestLocale: Promise<string | undefined>;
}) => Promise<{ locale: string; messages: Record<string, unknown> }>;

async function load(locale: string) {
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(app);
  const module = (await import(path.join(app, "i18n", "request.ts"))) as {
    default: RequestConfig;
  };
  return module.default({ requestLocale: Promise.resolve(locale) });
}

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "i18n-request-"));
  mkdirSync(path.join(app, "i18n"));
  copyFileSync(TEMPLATE, path.join(app, "i18n", "request.ts"));
  writeFileSync(
    path.join(app, "i18n", "routing.ts"),
    `export const routing = { locales: ["en", "mn"], defaultLocale: "en" };\n`
  );
  writeMessages("en", "pricing", {
    title: "Pricing",
    plans: { pro: { name: "Pro", description: "For teams" } },
  });
  writeMessages("en", "usage", { title: "Usage" });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(app, { recursive: true, force: true });
});

describe("i18n/request.ts (scaffold)", () => {
  it("fills keys and namespaces a locale lacks from the default locale", async () => {
    writeMessages("mn", "pricing", {
      title: "Үнэ",
      plans: { pro: { name: "Про" } },
    });

    const { locale, messages } = await load("mn");

    expect(locale).toBe("mn");
    expect(messages).toEqual({
      pricing: {
        title: "Үнэ",
        plans: { pro: { name: "Про", description: "For teams" } },
      },
      usage: { title: "Usage" },
    });
  });

  it("serves the default locale's own messages unchanged", async () => {
    const { messages } = await load("en");

    expect(messages).toEqual({
      pricing: {
        title: "Pricing",
        plans: { pro: { name: "Pro", description: "For teams" } },
      },
      usage: { title: "Usage" },
    });
  });
});
