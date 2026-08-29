/**
 * Real numbers, counted from the framework repository by
 * `pnpm sync` (scripts/sync-framework.mjs) and committed as
 * src/data/proof.json — so the site can't claim a test, a page or a
 * decision that doesn't exist, and a deploy needs no sibling checkout.
 * `sampledAt` says how fresh they are.
 */
import proof from "@/data/proof.json";

export type ProofSeries = {
  label: string;
  value: number;
  series: number[]; // chronological samples
};

export type ContributionDay = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };

/** Earlier samples of the same counts, one per milestone, for the sparklines. */
const HISTORY = {
  testFiles: [0, 0, 6, 8, 25],
  testCases: [0, 0, 71, 93, 195],
  architectureTests: [0, 0, 0, 0, 0],
  registryItems: [0, 0, 0, 4, 12],
  adrs: [0, 0, 0, 0, 3],
};

export const PROOF = {
  ...proof,
  days: proof.days as ContributionDay[],
  series: {
    testFiles: [...HISTORY.testFiles, proof.testFiles],
    testCases: [...HISTORY.testCases, proof.testCases],
    architectureTests: [...HISTORY.architectureTests, proof.architectureTests],
  },
};

export const PROOF_STATS: ProofSeries[] = [
  { label: "test cases", value: PROOF.testCases, series: PROOF.series.testCases },
  { label: "test files", value: PROOF.testFiles, series: PROOF.series.testFiles },
  { label: "architecture tests", value: PROOF.architectureTests, series: PROOF.series.architectureTests },
  { label: "page families", value: PROOF.registryItems, series: [...HISTORY.registryItems, PROOF.registryItems] },
  { label: "decisions as ADRs", value: PROOF.adrs, series: [...HISTORY.adrs, PROOF.adrs] },
];
