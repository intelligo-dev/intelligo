import { PROOF } from "@/lib/proof";

/**
 * The questions a developer asks before clicking GitHub — trust first.
 * Numbers come from proof.json so they never drift from the repository.
 */
export const FAQ = [
  {
    q: "Does Intelligo replace my AI framework?",
    a: "No. Mastra, the Vercel AI SDK or anything else stays native. Intelligo only brackets each run — admit, settle, fail — and has no agent, tool or memory abstraction to adopt.",
  },
  {
    q: "Is Intelligo a starter kit?",
    a: "No. A starter kit is cloned once and diverges. Here the services stay versioned packages on npm, and the pages arrive as source you own — rendered by your own shadcn primitives, with a doctor that knows which files you changed.",
  },
  {
    q: "Can I use it without Next.js?",
    a: "Not today. The packages are framework-agnostic TypeScript — services, ports, a Drizzle schema — but the registry pages and the create scaffold target Next.js 16.",
  },
  {
    q: "What about payments outside Stripe?",
    a: "billing-core defines the provider contract; Stripe is one implementation. The checkout and payment-poll items cover QR and invoice flows that wait for confirmation, and every amount carries its currency.",
  },
  {
    q: "Why trust a small open-source project with auth and billing?",
    a: `Because the risky parts are not hand-rolled: sessions and organizations are Better-Auth, payments are Stripe behind an idempotent finance ledger. Around them are ${PROOF.testCases} tests, real-database suites, and ${PROOF.architectureTests} architecture suites that fail the build. CI scaffolds an app from the packed CLI, builds it and boots it on every run.`,
  },
  {
    q: "What if the maintainer disappears?",
    a: "Nothing is rented. Apache-2.0, no open-core split, no hosted dependency; the packages are on npm and the pages are already in your repository. The reasoning is written down as ADRs, so the next maintainer has the why, not just the what.",
  },
];
