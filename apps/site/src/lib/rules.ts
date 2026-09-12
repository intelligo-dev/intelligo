/**
 * Architecture rules, with the assertion text the real tests emit.
 * The violation lines are illustrative inputs; the message shapes are
 * copied from tests/architecture/*.test.ts.
 */
export type Rule = {
  id: string;
  title: string;
  body: string;
  file: string;
  passing: string;
  violation: string;
  output: string[];
};

export const RULES: Rule[] = [
  {
    id: "deps",
    title: "Dependency direction",
    body: "auth importing billing fails the build.",
    file: "tests/architecture/dependency-direction.test.ts",
    passing:
      "✓ imports only allowlisted @intelligo-dev/* packages and no app code",
    violation:
      'import { credits } from "@intelligo-dev/billing"  // inside packages/auth',
    output: [
      "FAIL tests/architecture/dependency-direction.test.ts",
      "× auth › imports only allowlisted @intelligo-dev/* packages and no app code",
      "AssertionError: forbidden imports in auth:",
      "  src/services/team.ts → @intelligo-dev/billing (not in ALLOWED_DEPS)",
      "expected [ 'src/services/team.ts → @intelligo-dev/billing' ] to deeply equal []",
    ],
  },
  {
    id: "scope",
    title: "Tenant scoping",
    body: "A read across workspaces fails the suite.",
    file: "packages/core/src/identity/service.integration.test.ts",
    passing: "✓ refuses a read for another workspace's userId",
    violation:
      "db.select().from(facts).where(eq(facts.userId, userId))  // no workspaceId",
    output: [
      "FAIL packages/core/src/identity/service.integration.test.ts",
      "× identity service › refuses a read for another workspace's userId",
      "AssertionError: expected 0 rows visible to workspace B, got 3",
      "  facts inserted by workspace A were returned to workspace B",
    ],
  },
  {
    id: "registry",
    title: "Registry hygiene",
    body: "A private import inside a registry item fails the build.",
    file: "tests/architecture/registry.test.ts",
    passing: "✓ references only public packages and declared dependencies",
    violation:
      'import { privateTools } from "@acme/private-tools"  // inside packages/registry/base/chat',
    output: [
      "FAIL tests/architecture/registry.test.ts",
      "× registry items › import no private, deprecated, or @intelligo-dev/ui packages",
      "AssertionError: chat: components/chat/tool-renderer.tsx imports @acme/private-tools (private)",
      "expected [ 'chat: … @acme/private-tools (private)' ] to deeply equal []",
    ],
  },
  {
    id: "models",
    title: "Model ids",
    body: "An unregistered model id fails the build — nothing silently bills at the wrong rate.",
    file: "tests/architecture/model-registry.test.ts",
    passing: "✓ every model id used in the source is registered",
    violation: 'model: "anthropic/claude-5-turbo"  // not in MODEL_CONFIGS',
    output: [
      "FAIL tests/architecture/model-registry.test.ts",
      "× model registry › every model id used in the source is registered",
      "AssertionError: model ids that are not in MODEL_CONFIGS — these run on Gemini Flash and bill at Claude rates:",
      "  lib/chat-config.tsx: anthropic/claude-5-turbo",
    ],
  },
];
