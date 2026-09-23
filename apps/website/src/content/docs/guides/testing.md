---
title: Testing your app
description: Run Vitest against an app built on the framework — the server-only stub, why the framework packages are inlined, mocking the model, and what is worth testing in an app whose pages are installed.
order: 7
---

At the end of this page `pnpm test` runs your app's own tests: the seams you bind, your tools and your server actions, with no model calls and no browser.

## Add the setup

```bash
intelligo add vitest
pnpm add -D vitest
```

Then add `"test": "vitest run"` to the scripts in `package.json`. `intelligo add vitest` writes two files and records them in `intelligo.manifest.json` like every other generated file, so `upgrade --check` can tell you when the template moves.

<!-- snippet: packages/cli/templates/vitest/vitest.config.ts.tpl -->

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The app's test runner.
 *
 * - `@` resolves the way the app's tsconfig resolves it.
 * - `server-only` throws unless the bundler applies React's
 *   `react-server` condition, which a test does not; the stub stands in
 *   for it so a test can import server code.
 * - The `@intelligo-dev/*` packages ship compiled ESM that imports
 *   `server-only` itself. Vitest leaves node_modules to Node, where the
 *   alias above never applies, so they are inlined: transformed by
 *   Vitest like the app's own source, with the alias in effect.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    server: {
      deps: {
        inline: [/node_modules\/@intelligo-dev\//],
      },
    },
  },
});
```

The second file, `tests/stubs/server-only.ts`, is an empty module.

## Why the framework packages are inlined

The framework's server modules begin with `import "server-only"`, the guard that fails a build which pulls server code into the browser. Outside a `react-server` build the real package throws on import. An alias to the stub fixes that for your own files — but Vitest hands anything under `node_modules` to Node untransformed, and Node never sees a Vite alias. The first test that imports `lib/intelligo.ts` would then fail inside `@intelligo-dev/billing` on the guard, not on anything it tests.

`server.deps.inline` makes Vitest transform the `@intelligo-dev/*` packages itself, so the alias reaches their imports too. Mock a package by its specifier (`vi.mock("@intelligo-dev/core/documents")`), never by a path inside `node_modules`: the packages ship compiled ESM, and the file layout is not part of their contract.

## No model calls in CI

Mock the AI SDK provider you use, so a test never needs a key and never spends one:

```ts
import { vi } from "vitest";

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ modelId: "anthropic/claude-sonnet-4-6" })),
}));
```

For a whole chat turn, `@intelligo-dev/chat/testing` exports `createStubLanguageModel`: a language model that answers from a function of the last user message, can emit a tool call, and reports token usage like a real one. The scaffold's chat streams from it until you configure a provider.

## Environment read at import time

A module that reads the environment when it loads — a config object, a provider client built at the top of a file — sees whatever was set before the import. Stub the variables first and import afterwards, with a fresh module registry per test:

```ts
import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
});

it("builds links from the public URL", async () => {
  const { appUrl } = await import("@/lib/app-url");
  expect(appUrl("/login")).toBe("https://app.example.com/login");
});
```

## What is worth testing

Most of an app built on the framework is installed source the registry already tests, and `intelligo sync --check` keeps it the registry's. What only your tests reach is what you decided:

- **The seams you bind** — `lib/chat-server-config.ts` runs on a registered model id and gates on a feature key your plans declare; `lib/chat-config.tsx` names starters your messages define. The reference app's `lib/__tests__` has one of each.
- **Your tools and prompts** — the functions an agent calls, with the model mocked.
- **Your Server Actions** — parse, call the service, map its typed error. Mock the service's package and assert the mapping.
- **Your own tables** — against a real Postgres, skipped when there is none: `describe.skipIf(!process.env.TEST_DATABASE_URL)`.
