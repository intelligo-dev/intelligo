export type Alternative = {
  id: string;
  option: string;
  answer: string;
  keep: string[];
  drop: string[];
};

export const ALTERNATIVES: Alternative[] = [
  {
    id: "in-house",
    option: "Build it in-house",
    answer:
      "The other half — tenancy, entitlements, credits, billing, audit — arrives as typed services with the tests already around them.",
    keep: ["your stack: Next.js, Drizzle, Postgres", "your pages, as source"],
    drop: ["months of auth and billing you'd maintain forever"],
  },
  {
    id: "boilerplate",
    option: "Fork a SaaS boilerplate",
    answer:
      "A boilerplate is a snapshot you maintain alone. These stay upgradable packages — SemVer, migrations, doctor.",
    keep: ["a fast first day", "code you can read and edit"],
    drop: ["the fork that drifts the moment you touch it"],
  },
  {
    id: "platform",
    option: "Adopt an all-in-one AI platform",
    answer:
      "Those own your agent. Intelligo can't — there is no agent abstraction, only the boundary your framework's runs pass through.",
    keep: ["your agent, your framework, your prompts", "your model keys"],
    drop: ["a runtime you rent and can't leave"],
  },
  {
    id: "prompt",
    option: "Prompt it from zero with Claude or Codex",
    answer:
      "Auth and billing need senior judgment every time. Here it already shipped, tested — your coding agent only has to be good at the product.",
    keep: ["the coding agent, for the half that is yours"],
    drop: ["reviewing tenant isolation you didn't write"],
  },
  {
    id: "primitives",
    option: "Wire up Supabase, Clerk and Stripe yourself",
    answer:
      "Unconnected primitives. This is a pre-wired boundary that ties AI cost to credits, entitlements and audit — the glue is what goes wrong.",
    keep: [
      "Stripe — it's the provider behind billing",
      "Postgres — the only store",
    ],
    drop: ["the glue between three vendors' ideas of a user"],
  },
  {
    id: "retool",
    option: "Build the whole thing in Retool",
    answer:
      "Retool is for internal tools. This is a customer-facing product whose source you own and deploy like any Next.js app.",
    keep: ["a customer-facing product", "your deployment"],
    drop: ["an internal-tool builder stretched into a product"],
  },
];
