/**
 * Real numbers, counted from the framework repository by
 * `pnpm sync` (scripts/sync-framework.mjs) and committed as
 * src/data/proof.json — so the site can't claim a test, a page or a
 * package that doesn't exist, and a deploy needs no sibling checkout.
 * `sampledAt` says how fresh they are. Rendered statically: the real
 * value is in the generated HTML, never a zero that counts up.
 */
import proof from "@/data/proof.json";

export const PROOF = {
  sampledAt: proof.sampledAt as string,
  version: proof.version as string,
  published: proof.published as string,
  packages: proof.packages as number,
  testCases: proof.testCases as number,
  testFiles: proof.testFiles as number,
  architectureTests: proof.architectureTests as number,
  registryItems: proof.registryItems as number,
};
