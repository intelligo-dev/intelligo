/**
 * The reference application (apps/app), in the order a new user meets
 * it. Every step is a route that exists in apps/app today, tied to the
 * registry item and the package that produce it. Nothing here is
 * aspirational — the hotspot is a real exported function.
 */
export type WalkthroughStep = {
  id: string;
  label: string;
  route: string;
  /** Registry item(s) the route is installed from, or "—" for a package-owned surface. */
  item: string;
  /** The service behind the page. */
  pkg: string;
  /** The function the page's action calls. */
  hotspot: string;
  /** Who owns the UI once installed. */
  ownership: "consumer source" | "package runtime";
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
  { id: "signup", label: "sign-up", route: "/signup", item: "auth-signup", pkg: "@intelligo-dev/auth", hotspot: "signUp()", ownership: "consumer source", scene: "signup" },
  { id: "verify", label: "verify", route: "/verify-email", item: "auth-email-verification", pkg: "@intelligo-dev/auth", hotspot: "sendVerificationEmail()", ownership: "consumer source", scene: "verify" },
  { id: "workspace", label: "workspace", route: "/onboarding", item: "onboarding", pkg: "@intelligo-dev/auth", hotspot: "createOnboardingService()", ownership: "consumer source", scene: "workspace" },
  { id: "dashboard", label: "dashboard", route: "/dashboard", item: "app-shell · dashboard", pkg: "@intelligo-dev/core", hotspot: "listConversations()", ownership: "consumer source", scene: "dashboard" },
  { id: "team", label: "team", route: "/settings/team", item: "team-settings", pkg: "@intelligo-dev/auth", hotspot: "createTeamService()", ownership: "consumer source", scene: "team" },
  { id: "billing", label: "billing", route: "/pricing", item: "pricing · checkout", pkg: "@intelligo-dev/billing", hotspot: "createCheckoutSession()", ownership: "consumer source", scene: "billing" },
  { id: "usage", label: "usage", route: "/usage", item: "usage", pkg: "@intelligo-dev/executions", hotspot: "summarizeExecutions()", ownership: "consumer source", scene: "usage" },
  { id: "chat", label: "chat", route: "/chat", item: "chat", pkg: "@intelligo-dev/executions · core", hotspot: "executions.begin()", ownership: "consumer source", scene: "chat" },
  { id: "artifacts", label: "artifacts", route: "/artifacts", item: "artifacts", pkg: "@intelligo-dev/core", hotspot: "listDocuments()", ownership: "consumer source", scene: "artifacts" },
  { id: "admin", label: "admin", route: "/admin", item: "—", pkg: "@intelligo-dev/admin · audit", hotspot: "recordAuditEvent()", ownership: "package runtime", scene: "admin" },
];
