export const FAQ = [
  {
    q: "Why should I trust a small OSS project's auth and billing?",
    a: "Every invariant — tenant isolation, idempotent settlement, credit reservation — is enforced by unit, real-database and architecture tests that fail the build. And the same code runs Acme in production.",
  },
  {
    q: "Is this just a starter kit I'll outgrow?",
    a: "No. A starter kit is cloned once and diverges. This stays a versioned dependency — SemVer, migrations, doctor, codemods.",
  },
  {
    q: "What happens if the maintainer disappears?",
    a: "Apache-2.0 — the code is yours to fork. It's also genuinely pre-release: APIs are still settling.",
  },
  {
    q: "Does this lock me into a specific AI framework?",
    a: "No. Mastra, the Vercel AI SDK or anything else stay native. There is no agent, tool or memory abstraction to adopt.",
  },
  {
    q: "Can I use it without Next.js?",
    a: "Not today. The services are plain TypeScript, but the pages and the composition root target Next.js 16.",
  },
  {
    q: "Is it on npm?",
    a: "Not yet. Install from a clone; npm publication follows the first tagged release.",
  },
  {
    q: "What about payments outside Stripe?",
    a: "A provider seam plus a payment-poll page item for QR and invoice flows — QPay, PIX, UPI, PromptPay.",
  },
];
