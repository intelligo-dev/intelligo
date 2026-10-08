import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkSeamBoundaries, serverReach } from "./doctor-seams.js";

describe("serverReach", () => {
  it("lets the auth client and core's prompt and request-context leaves through", () => {
    const source = [
      'import { useSession } from "@intelligo-dev/auth/client";',
      'import { sanitizeForSystemPrompt } from "@intelligo-dev/core/prompt";',
      'import { getRequestContext } from "@intelligo-dev/core/request-context";',
    ].join("\n");
    expect(serverReach(source)).toEqual([]);
  });

  it("finds server modules and secrets, and lets types and client leaves through", () => {
    const source = [
      'import "server-only";',
      'import { db } from "@intelligo-dev/core/db";',
      'import type { CreditBundle } from "@intelligo-dev/billing";',
      'import { fromMajor } from "@intelligo-dev/core/money";',
      'import { readFileSync } from "node:fs";',
      "const key = process.env.STRIPE_SECRET_KEY;",
      "const url = process.env.NEXT_PUBLIC_APP_URL;",
    ].join("\n");
    expect(serverReach(source)).toEqual([
      "server-only",
      "@intelligo-dev/core/db",
      "node:fs",
      "process.env.STRIPE_SECRET_KEY",
    ]);
  });
});

describe("checkSeamBoundaries", () => {
  it("warns about a client seam that reaches the server, and only that", () => {
    const root = mkdtempSync(path.join(tmpdir(), "seams-"));
    mkdirSync(path.join(root, "lib"));
    writeFileSync(
      path.join(root, "lib/chat-config.tsx"),
      'import { db } from "@intelligo-dev/core/db";\n'
    );
    writeFileSync(
      path.join(root, "lib/chat-model.ts"),
      'import { db } from "@intelligo-dev/core/db";\n'
    );
    const results = checkSeamBoundaries(root, {
      "lib/chat-config.tsx": "client",
      "lib/chat-model.ts": "server",
      "lib/nav-config.ts": "client",
    });
    expect(results).toEqual([
      expect.objectContaining({
        name: "seam:lib/chat-config.tsx",
        status: "warn",
      }),
    ]);
  });
});
