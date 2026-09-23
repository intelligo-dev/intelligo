/**
 * doctor tests — the check semantics, not the formatting.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, it, expect } from "vitest";

import { exitCodeFor, formatResults, runChecks } from "./doctor.js";

const fullEnv = {
  DATABASE_URL: "postgresql://localhost/x",
  BETTER_AUTH_SECRET: "a-secret-padded-to-thirty-two-chars",
  NEXT_PUBLIC_APP_URL: "http://localhost:4000",
  INTELLIGO_BILLING_PRODUCT: "acme",
} as NodeJS.ProcessEnv;

describe("runChecks", () => {
  it("reports every missing required variable in one line", () => {
    const results = runChecks({ root: "/nonexistent", env: {} });
    const env = results.find((r) => r.name === "env")!;

    expect(env.status).toBe("error");
    expect(env.detail).toContain("DATABASE_URL");
    expect(env.detail).toContain("BETTER_AUTH_SECRET");
  });

  it("passes the env check when all required variables are present", () => {
    const results = runChecks({ root: "/nonexistent", env: fullEnv });

    expect(results.find((r) => r.name === "env")!.status).toBe("ok");
  });

  it("errors on a BETTER_AUTH_SECRET the app would refuse to boot with", () => {
    const results = runChecks({
      root: "/nonexistent",
      env: { ...fullEnv, BETTER_AUTH_SECRET: "short" },
    });
    const env = results.filter((r) => r.name === "env");

    expect(env).toHaveLength(1);
    expect(env[0]!.status).toBe("error");
    expect(env[0]!.detail).toContain("32");
    expect(exitCodeFor(results)).toBe(1);
  });

  it("warns when production would build links to localhost", () => {
    const warned = (env: NodeJS.ProcessEnv) =>
      runChecks({ root: "/nonexistent", env }).some(
        (r) => r.name === "env" && r.status === "warn"
      );

    expect(warned(fullEnv)).toBe(false);
    expect(warned({ ...fullEnv, NODE_ENV: "production" })).toBe(true);
    expect(
      warned({
        ...fullEnv,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
      })
    ).toBe(false);
  });

  it("reads the localhost URL out of a production env file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-env-"));
    try {
      writeFileSync(
        path.join(root, ".env.production"),
        "NEXT_PUBLIC_APP_URL=http://localhost:3000\n"
      );
      const results = runChecks({ root, env: fullEnv });
      const warning = results.find(
        (r) => r.name === "env" && r.status === "warn"
      )!;

      expect(warning.detail).toContain(".env.production");
      expect(exitCodeFor(results)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("warns when no billing product is configured", () => {
    // The engine has no built-in default catalogue, so an unset
    // product means plan lookups find nothing.
    const results = runChecks({ root: "/nonexistent", env: {} });

    expect(results.find((r) => r.name === "billing")!.status).toBe("warn");
  });

  it("warns rather than errors when run outside the workspace", () => {
    const results = runChecks({ root: "/nonexistent", env: fullEnv });
    const migrations = results.find((r) => r.name === "migrations")!;

    expect(migrations.status).toBe("warn");
    expect(migrations.detail).toContain("workspace root");
  });

  describe("installed registry items against requires.json", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    const requires = {
      scaffold: ["lib/intelligo", "lib/plans", "i18n/navigation"],
      items: {
        "route-error": { marker: "components/errors/route-error.tsx" },
        chat: {
          marker: "app/chat/page.tsx",
          items: ["route-error"],
          files: ["lib/intelligo", "i18n/navigation"],
          exports: { "lib/intelligo": ["composeIntelligo", "executions"] },
          features: ["chat"],
        },
      },
    };

    function app(files: Record<string, string>): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-"));
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), body);
      }
      return root;
    }

    it("names every unmet requirement of an installed item", () => {
      const results = runChecks({
        root: app({
          "app/chat/page.tsx": "// chat",
          "lib/intelligo.ts": "export const composeIntelligo = () => {};",
          "lib/plans.ts": "export const FEATURES = { assistant: ['free'] };",
        }),
        env: fullEnv,
        requires,
      });
      const chat = results.find((r) => r.name === "item:chat")!;

      expect(chat.status).toBe("error");
      expect(chat.detail).toContain("install the route-error item first");
      expect(chat.detail).toContain("create i18n/navigation");
      expect(chat.detail).toContain("lib/intelligo must export executions");
      expect(chat.detail).toContain('"chat" feature key');
    });

    it("passes once siblings, files, exports and feature keys are in place", () => {
      const results = runChecks({
        root: app({
          "app/chat/page.tsx": "// chat",
          "components/errors/route-error.tsx": "// route-error",
          "i18n/navigation.ts": "// nav",
          "lib/intelligo.ts":
            "export function composeIntelligo() {}\nexport const executions = {};",
          "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
        }),
        env: fullEnv,
        requires,
      });
      expect(results.find((r) => r.name === "item:chat")!.status).toBe("ok");
      expect(results.find((r) => r.name === "item:route-error")!.status).toBe(
        "ok"
      );
    });

    it("accepts an async or default export of a required name", () => {
      const results = runChecks({
        root: app({
          "app/chat/page.tsx": "// chat",
          "components/errors/route-error.tsx": "// route-error",
          "i18n/navigation.ts": "// nav",
          "lib/intelligo.ts":
            "export async function composeIntelligo() {}\nexport const executions = {};",
          "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
        }),
        env: fullEnv,
        requires,
      });
      expect(results.find((r) => r.name === "item:chat")!.status).toBe("ok");
    });

    const installed = {
      "app/chat/page.tsx": "// chat",
      "components/errors/route-error.tsx": "// route-error",
      "i18n/navigation.ts": "// nav",
    };
    const chatResult = (files: Record<string, string>) =>
      runChecks({
        root: app({ ...installed, ...files }),
        env: fullEnv,
        requires,
      }).find((r) => r.name === "item:chat")!;

    it("accepts type exports, aliases and named re-exports", () => {
      expect(
        chatResult({
          "lib/intelligo.ts": [
            "export type composeIntelligo = () => void;",
            'export { executionsImpl as executions } from "./impl";',
          ].join("\n"),
          "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
        }).status
      ).toBe("ok");
      expect(
        chatResult({
          "lib/intelligo.ts":
            "export interface composeIntelligo {}\nconst e = 1;\nexport { e as executions };",
          "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
        }).status
      ).toBe("ok");
    });

    it("is not satisfied by an export named in a comment", () => {
      const chat = chatResult({
        "lib/intelligo.ts":
          "export function composeIntelligo() {}\n// export const executions = {};\n/* export { executions } */",
        "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
      });
      expect(chat.status).toBe("error");
      expect(chat.detail).toContain("must export executions");
    });

    it("follows export * into a module it can resolve", () => {
      const ok = chatResult({
        "lib/intelligo.ts": 'export * from "./root";',
        "lib/root/index.ts":
          "export function composeIntelligo() {}\nexport const executions = {};",
        "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
      });
      expect(ok.status).toBe("ok");

      const missing = chatResult({
        "lib/intelligo.ts": 'export * from "@/lib/root";',
        "lib/root.ts": "export function composeIntelligo() {}",
        "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
      });
      expect(missing.status).toBe("error");
      expect(missing.detail).toContain("must export executions");
    });

    it("warns, not errors, when export * leads somewhere it cannot read", () => {
      const chat = chatResult({
        "lib/intelligo.ts": 'export * from "@acme/not-installed";',
        "lib/plans.ts": "export const FEATURES = { chat: ['free'] };",
      });
      expect(chat.status).toBe("warn");
      expect(chat.detail).toContain("@acme/not-installed");
    });

    it("reads feature keys quoted or bare, and never from a comment", () => {
      const withPlans = (plans: string) =>
        chatResult({
          "lib/intelligo.ts":
            "export function composeIntelligo() {}\nexport const executions = {};",
          "lib/plans.ts": plans,
        }).status;
      expect(withPlans('export const FEATURES = { "chat": ["free"] };')).toBe("ok");
      expect(withPlans("export const FEATURES = {\n  // chat: ['free'],\n};")).toBe(
        "error"
      );
      expect(withPlans("export const FEATURES = { mychat: ['free'] };")).toBe(
        "error"
      );
    });

    it("finds feature keys in the package lib/plans.ts re-exports", () => {
      const status = chatResult({
        "lib/intelligo.ts":
          "export function composeIntelligo() {}\nexport const executions = {};",
        "lib/plans.ts":
          'export { PLANS, FEATURES } from "@acme/career/config";',
        "node_modules/@acme/career/package.json": JSON.stringify({
          name: "@acme/career",
          exports: { "./config": { import: "./src/config/index.ts" } },
        }),
        "node_modules/@acme/career/src/config/index.ts":
          'export * from "./features";',
        "node_modules/@acme/career/src/config/features.ts":
          "export const FEATURES = { chat: ['free'] };\nexport const PLANS = [];",
      }).status;
      expect(status).toBe("ok");
    });

    it("finds them through an import a bare export list passes on", () => {
      const status = chatResult({
        "lib/intelligo.ts":
          "export function composeIntelligo() {}\nexport const executions = {};",
        "lib/plans.ts":
          'import { FEATURES } from "./catalogue";\nexport { FEATURES };',
        "lib/catalogue.ts": "export const FEATURES = { chat: ['free'] };",
      }).status;
      expect(status).toBe("ok");
    });

    it("is silent for items whose marker file is absent", () => {
      const results = runChecks({ root: app({}), env: fullEnv, requires });
      expect(results.some((r) => r.name.startsWith("item:"))).toBe(false);
    });

    it("checks the reference app against the bundled requirements", () => {
      // The canonical installed result must satisfy its own contract.
      const results = runChecks({
        root: path.resolve(__dirname, "../../../../apps/app"),
        env: fullEnv,
      });
      const failing = results.filter(
        (r) => r.name.startsWith("item:") && r.status !== "ok"
      );
      expect(failing.map((r) => `${r.name}: ${r.detail}`)).toEqual([]);
      expect(results.some((r) => r.name === "item:chat")).toBe(true);
    });
  });

  describe("model prices", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function withCompositionRoot(source: string): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-models-"));
      mkdirSync(path.join(root, "lib"), { recursive: true });
      writeFileSync(path.join(root, "lib/intelligo.ts"), source);
      return root;
    }

    it("errors when the composition root registers no prices", () => {
      // Nothing self-registers, so admission has no price to estimate
      // against and refuses every request with `unknown_model` — at
      // runtime, for one missing line.
      const results = runChecks({
        root: withCompositionRoot(
          `export function composeIntelligo() { setDefaultProductSlug("acme"); }`
        ),
        env: fullEnv,
      });
      const models = results.find((r) => r.name === "models")!;

      expect(models.status).toBe("error");
      expect(models.detail).toContain("registerModels");
    });

    it("passes when it does", () => {
      const results = runChecks({
        root: withCompositionRoot(
          `import { DEFAULT_MODELS, registerModels } from "@intelligo-dev/executions";
           export function composeIntelligo() { registerModels(DEFAULT_MODELS); }`
        ),
        env: fullEnv,
      });

      expect(results.find((r) => r.name === "models")!.status).toBe("ok");
    });

    it("is not satisfied by a comment that mentions it", () => {
      // The scaffold's own doc comment names registerModels; a check
      // that a comment can pass is not a check.
      const results = runChecks({
        root: withCompositionRoot(
          `// call registerModels(DEFAULT_MODELS) here
           export function composeIntelligo() {}`
        ),
        env: fullEnv,
      });

      expect(results.find((r) => r.name === "models")!.status).toBe("error");
    });

    it("is silent where there is no composition root to read", () => {
      const results = runChecks({ root: "/nonexistent", env: fullEnv });
      expect(results.find((r) => r.name === "models")).toBeUndefined();
    });
  });

  describe("model ids in the chat seam", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    // Unregistered ids are assembled, not written: the repository's own
    // model-registry rule reads every literal in the tree, tests included.
    const id = (provider: string, model: string) => `${provider}/${model}`;
    const TYPO = id("google", "gemini-2.5-flahs");
    const CUSTOM = id("anthropic", "claude-custom");

    const CATALOGUE = `export const DEFAULT_MODELS = [
      { id: "google/gemini-2.5-flash", provider: "google" },
    ];`;
    const DEFAULT_ROOT = `import { DEFAULT_MODELS, registerModels } from "@intelligo-dev/executions";
      export function composeIntelligo() { registerModels(DEFAULT_MODELS); }`;

    function app(files: Record<string, string>): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-ids-"));
      const all = {
        "node_modules/@intelligo-dev/executions/dist/pricing.js": CATALOGUE,
        ...files,
      };
      for (const [rel, body] of Object.entries(all)) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), body);
      }
      return root;
    }

    const modelIds = (dir: string) =>
      runChecks({ root: dir, env: fullEnv, requires: null }).find(
        (r) => r.name === "model-ids"
      );

    it("passes an id the shipped catalogue prices", () => {
      const result = modelIds(
        app({
          "lib/intelligo.ts": DEFAULT_ROOT,
          "lib/chat-model.ts": `export const CHAT_MODEL_ID = "google/gemini-2.5-flash";`,
        })
      )!;

      expect(result.status).toBe("ok");
    });

    it("errors on an id nothing registers, naming the file", () => {
      const result = modelIds(
        app({
          "lib/intelligo.ts": DEFAULT_ROOT,
          "lib/chat-models.ts": `export const MODELS = ["${TYPO}"];`,
        })
      )!;

      expect(result.status).toBe("error");
      expect(result.detail).toContain(TYPO);
      expect(result.detail).toContain("lib/chat-models.ts");
    });

    it("accepts an id the composition root registers by literal", () => {
      const result = modelIds(
        app({
          "lib/intelligo.ts": `${DEFAULT_ROOT}
            registerModel({ id: "${CUSTOM}", provider: "anthropic" });`,
          "lib/chat-server-config.ts": `const id = '${CUSTOM}';`,
        })
      )!;

      expect(result.status).toBe("ok");
    });

    it("does not count the catalogue for a root that never registers it", () => {
      const result = modelIds(
        app({
          "lib/intelligo.ts": `registerModel({ id: "${id("openai", "own")}", provider: "openai" });`,
          "lib/chat-model.ts": `export const CHAT_MODEL_ID = "google/gemini-2.5-flash";`,
        })
      )!;

      expect(result.status).toBe("error");
    });

    it("only warns when the catalogue is defined in another module", () => {
      const result = modelIds(
        app({
          "lib/intelligo.ts": `import { MODELS } from "./models";
            export function composeIntelligo() { registerModels(MODELS); }`,
          "lib/chat-model.ts": `export const CHAT_MODEL_ID = "${id("mistral", "large")}";`,
        })
      )!;

      expect(result.status).toBe("warn");
    });

    it("warns when DEFAULT_MODELS cannot be read", () => {
      const dir = app({
        "lib/intelligo.ts": DEFAULT_ROOT,
        "lib/chat-model.ts": `export const CHAT_MODEL_ID = "google/gemini-2.5-flash";`,
      });
      rmSync(path.join(dir, "node_modules"), { recursive: true });

      expect(modelIds(dir)!.status).toBe("warn");
    });

    it("ignores ids named only in comments, and apps with no chat seam", () => {
      expect(
        modelIds(
          app({
            "lib/intelligo.ts": DEFAULT_ROOT,
            "lib/chat-model.ts": `// was "${id("openai", "gpt-0")}"\nexport const x = 1;`,
          })
        )
      ).toBeUndefined();
    });
  });

  describe("Better-Auth's HTTP mount", () => {
    let root: string;

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    function app(files: string[]): string {
      root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-auth-"));
      for (const rel of files) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), "// generated");
      }
      return root;
    }

    it("errors when auth pages are installed without the catch-all route", () => {
      const results = runChecks({
        root: app(["app/[locale]/(auth)/layout.tsx"]),
        env: fullEnv,
      });
      const mount = results.find((r) => r.name === "auth-mount")!;

      expect(mount.status).toBe("error");
      expect(mount.detail).toContain("app/api/auth/[...all]/route.ts");
    });

    it("passes once the route exists", () => {
      const results = runChecks({
        root: app([
          "app/[locale]/(auth)/layout.tsx",
          "app/api/auth/[...all]/route.ts",
        ]),
        env: fullEnv,
      });
      expect(results.find((r) => r.name === "auth-mount")!.status).toBe("ok");
    });

    it("is silent in an app with no auth pages", () => {
      const results = runChecks({ root: app([]), env: fullEnv });
      expect(results.some((r) => r.name === "auth-mount")).toBe(false);
    });
  });

  it("reports the real repository's migration drift", () => {
    // Guards the check itself: if the journal is ever repaired this
    // flips to ok, and if the check silently stops working it flips
    // too — either way the test notices.
    const results = runChecks({ root: process.cwd() + "/../..", env: fullEnv });

    expect(results.some((r) => r.name === "migrations")).toBe(true);
  });
});

describe("exitCodeFor", () => {
  it("is non-zero when anything errored", () => {
    expect(exitCodeFor([{ name: "x", status: "error", detail: "" }])).toBe(1);
  });

  it("is zero for warnings — they are advisory, not blocking", () => {
    expect(exitCodeFor([{ name: "x", status: "warn", detail: "" }])).toBe(0);
  });
});

describe("formatResults", () => {
  it("marks each status distinctly", () => {
    const out = formatResults([
      { name: "a", status: "ok", detail: "fine" },
      { name: "b", status: "error", detail: "broken" },
    ]);

    expect(out).toContain("✓ a");
    expect(out).toContain("✗ b");
  });
});
