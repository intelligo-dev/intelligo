import { EXAMPLE } from "@/lib/example";
import { PROOF } from "@/lib/proof";

/**
 * The questions a developer asks before clicking GitHub — trust first.
 * Numbers come from proof.json so they never drift from the repository.
 */
export const FAQ = [
  {
    q: "Does Intelligo replace my AI framework?",
    a: "No. Mastra, the Vercel AI SDK or anything else stays native. Intelligo only brackets each run — admit, settle, fail — and has no agent or tool abstraction to adopt. The chat block is the one place with a wire format: it streams the AI SDK's UI messages, and another runtime plugs in by emitting them.",
  },
  {
    q: "Is anything real running on it?",
    a: `One product so far. ${EXAMPLE.name}, ${EXAMPLE.what}, is in beta with its first users at ${EXAMPLE.host}. It is the product the framework was extracted from, and it consumes the same npm packages and registry blocks you would — there is no private fork. That is one product at small scale, not a wall of logos; the reference app in the repository is the other thing you can run and read.`,
  },
  {
    q: "Is it ready for production?",
    a: "It is a 1.0 beta. Everything on this site exists and runs today, but APIs are still settling: a beta can break one, and every break is listed in the changelog with what to change. The database schema is one baseline that only moves forward through migrations.",
  },
  {
    q: "Is Intelligo a starter kit?",
    a: "No. A starter kit is cloned once and diverges. Here the services stay versioned packages on npm, and the pages arrive as source you own — rendered by your own shadcn primitives, with a manifest that tells upgrade --check which generated files you changed.",
  },
  {
    q: "Can I use it without Next.js?",
    a: "Not today. The services are plain TypeScript — ports, a Drizzle schema, Web Request and Response — and only the admin views and email templates are React. But the blocks and the create scaffold target Next.js 16.",
  },
  {
    q: "What about payments outside Stripe?",
    a: "Stripe is the one provider that ships. billing/payment is the contract you implement for another, the checkout and payment-poll blocks are the pages for QR and invoice flows that wait for confirmation, and every amount carries its currency.",
  },
  {
    q: "Why trust a small open-source project with auth and billing?",
    a: `Because the risky parts are not hand-rolled: sessions and organizations are Better-Auth, payments are Stripe behind an idempotent finance ledger. Around them are ${PROOF.testCases} tests, real-database suites, and ${PROOF.architectureTests} architecture suites that fail the build. Every release scaffolds an app from the packed CLI, builds it and boots it before npm sees it.`,
  },
  {
    q: "What if the maintainer disappears?",
    a: "Nothing is rented. Apache-2.0, no open-core split, no hosted dependency; the packages are on npm and the pages are already in your repository.",
  },
];
