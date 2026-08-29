/**
 * The hero walkthrough: every surface the reference application
 * (apps/app) has, in the order a new user meets it, each tied to the
 * registry item and package that produce it. Nothing here is aspirational —
 * every step is a route that exists in apps/app today.
 */
export type WalkthroughStep = {
  id: string;
  label: string;
  route: string;
  item: string;
  pkg: string;
  hotspot: string;
  scene:
    | "signup"
    | "verify"
    | "workspace"
    | "dashboard"
    | "team"
    | "billing"
    | "usage"
    | "chat"
    | "artifacts"
    | "admin";
};

export const WALKTHROUGH: WalkthroughStep[] = [
  { id: "signup", label: "sign-up", route: "/signup", item: "auth-signup", pkg: "@intelligo-dev/auth", hotspot: "auth.signUp()", scene: "signup" },
  { id: "verify", label: "verify", route: "/verify-email", item: "auth-email-verification", pkg: "@intelligo-dev/core · email", hotspot: "sendVerificationEmail()", scene: "verify" },
  { id: "workspace", label: "workspace", route: "/onboarding", item: "onboarding", pkg: "@intelligo-dev/auth", hotspot: "createOnboardingService()", scene: "workspace" },
  { id: "dashboard", label: "dashboard", route: "/dashboard", item: "dashboard", pkg: "@intelligo-dev/core · conversations", hotspot: "conversations.list()", scene: "dashboard" },
  { id: "team", label: "team", route: "/settings/team", item: "team-settings", pkg: "@intelligo-dev/auth", hotspot: "createTeamService()", scene: "team" },
  { id: "billing", label: "billing", route: "/pricing", item: "pricing · checkout", pkg: "@intelligo-dev/billing", hotspot: "checkout.verify()", scene: "billing" },
  { id: "usage", label: "usage", route: "/usage", item: "usage", pkg: "@intelligo-dev/executions", hotspot: "executions.query()", scene: "usage" },
  { id: "chat", label: "chat", route: "/chat", item: "chat", pkg: "@intelligo-dev/executions + core", hotspot: "executions.begin()", scene: "chat" },
  { id: "artifacts", label: "artifacts", route: "/artifacts", item: "artifacts", pkg: "@intelligo-dev/core · documents", hotspot: "documents.list()", scene: "artifacts" },
  { id: "admin", label: "admin", route: "/admin", item: "@intelligo-dev/admin", pkg: "@intelligo-dev/audit", hotspot: "audit.record()", scene: "admin" },
];

export const AGENT_FRAMEWORKS = ["Mastra", "Vercel AI SDK", "anything"] as const;
