/**
 * Architecture rules, with the assertion text the real tests emit.
 * `passing` is the title of a test in `file`, word for word, and
 * tests/architecture/docs.test.ts fails when it stops being one. The
 * violation lines are illustrative inputs; the message shapes are the
 * ones those tests build.
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
      "× package dependency direction › auth › imports only allowlisted @intelligo-dev/* packages and no app code",
      "AssertionError: forbidden imports in auth:",
      "  packages/auth/src/team/service.ts → @intelligo-dev/billing",
      "expected [ 'packages/auth/src/team/service.ts → @intelligo-dev/billing' ] to deeply equal []",
    ],
  },
  {
    id: "scope",
    title: "Tenant scoping",
    body: "A read across workspaces fails the suite, against a real database.",
    file: "packages/core/src/documents/service.integration.test.ts",
    passing:
      "✓ getDocument throws not_found for another workspace/user's document",
    violation:
      "db.select().from(documents).where(eq(documents.id, id))  // no workspaceId",
    output: [
      "FAIL packages/core/src/documents/service.integration.test.ts",
      "× documents service — real DB integration › getDocument throws not_found for another workspace/user's document",
      "AssertionError: promise resolved instead of rejecting",
      "  the other actor was handed a document it does not own",
    ],
  },
  {
    id: "registry",
    title: "Registry hygiene",
    body: "A block that imports a package nobody can install fails the build.",
    file: "tests/architecture/registry.test.ts",
    passing: "✓ imports no unpublished, dissolved, or @intelligo-dev/ui path",
    violation:
      'import { tools } from "@intelligo-dev/private-tools"  // inside packages/registry/base/chat',
    output: [
      "FAIL tests/architecture/registry.test.ts",
      "× registry › chat › imports no unpublished, dissolved, or @intelligo-dev/ui path",
      "AssertionError: expected [ …(1) ] to deeply equal []",
      "  packages/registry/base/chat/components/tool-renderer.tsx → @intelligo-dev/private-tools (not a package this repository publishes)",
    ],
  },
  {
    id: "models",
    title: "Model ids",
    body: "An unregistered model id fails the build — and at run time pricing throws rather than guess a rate.",
    file: "tests/architecture/model-registry.test.ts",
    passing: "✓ every model id used in the source is in the shipped catalogue",
    violation: 'model: "anthropic/claude-5-turbo"  // not in DEFAULT_MODELS',
    output: [
      "FAIL tests/architecture/model-registry.test.ts",
      "× model registry › every model id used in the source is in the shipped catalogue",
      "AssertionError: model ids that are not in DEFAULT_MODELS — nothing in this repository registers them, so pricing them throws at request time:",
      "  lib/chat-config.tsx: anthropic/claude-5-turbo",
    ],
  },
];
