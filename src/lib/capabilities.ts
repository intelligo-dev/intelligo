/**
 * The 30/70 model, at the altitude the homepage needs. Every capability
 * here is a service or surface that exists in the packages today; the
 * full list of what each one does lives on /why-intelligo and in the
 * framework README.
 */
export const YOUR_LAYER = [
  { title: "Prompts", note: "the voice, the guardrails" },
  { title: "Tools", note: "what the agent can actually do" },
  { title: "Domain logic", note: "the workflow that is your product" },
  { title: "Knowledge", note: "the data nobody else has" },
  { title: "Evals", note: "how you know it's getting better" },
];

export type CapabilityGroup = {
  id: string;
  label: string;
  pkg: string;
  items: string[];
};

export const INTELLIGO_LAYER: CapabilityGroup[] = [
  { id: "identity", label: "Identity", pkg: "auth", items: ["Auth", "Workspaces", "Roles", "Invitations"] },
  { id: "commerce", label: "Commerce", pkg: "billing", items: ["Plans", "Entitlements", "Credits", "Billing", "Payments"] },
  { id: "ai-ops", label: "AI operations", pkg: "executions", items: ["Executions", "Usage", "Costs", "Models"] },
  { id: "product", label: "Product", pkg: "core", items: ["Chat", "Documents", "Notifications", "Privacy"] },
  { id: "operations", label: "Operations", pkg: "jobs · audit · admin", items: ["Jobs", "Audit", "Admin"] },
];
