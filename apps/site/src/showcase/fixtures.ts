/**
 * The data the preview hands to the real components — what a consumer's
 * page would have read from the packages.
 */
import type { UIMessage } from "ai";
import type { OrgInvitation } from "@intelligo-dev/auth";
import type { CheckoutSessionSummary } from "@intelligo-dev/billing";
import type { PlanConfig } from "@intelligo-dev/billing/plans";
import type { TeamMember } from "@showcase/components/team/member-list";
import type { Workspace } from "@showcase/components/shell/workspace-switcher";
import type { RecentConversation } from "@showcase/components/dashboard/recent-conversations";
import { daysAgo } from "@showcase/actions/_preview";
export { NOTIFICATIONS } from "@showcase/actions/notifications";
export { DOCUMENTS } from "@showcase/actions/documents";
export { CONVERSATIONS } from "@showcase/actions/chat";
export { USAGE_OVERVIEW } from "@showcase/actions/usage";
export { FACTS, AUDIT_TRAIL } from "@showcase/actions/privacy";

export const USER = {
  id: "user_you",
  name: "You",
  email: "you@company.com",
  image: null,
};

export const WORKSPACES: Workspace[] = [
  { id: "ws_acme", name: "Acme Research", slug: "acme-research" },
  { id: "ws_side", name: "Side project", slug: "side-project" },
];
export const WORKSPACE = WORKSPACES[0]!;

export const MEMBERS: TeamMember[] = [
  {
    id: "m_you",
    userId: "user_you",
    role: "owner",
    user: { name: "You", email: "you@company.com" },
    createdAt: daysAgo(40),
  },
  {
    id: "m_maria",
    userId: "user_maria",
    role: "admin",
    user: { name: "Maria Chen", email: "maria@acme.co" },
    createdAt: daysAgo(12),
  },
  {
    id: "m_li",
    userId: "user_li",
    role: "member",
    user: { name: "Li Wei", email: "li@acme.co" },
    createdAt: daysAgo(3),
  },
];

export const INVITATIONS: OrgInvitation[] = [
  {
    id: "inv_sam",
    email: "sam@acme.co",
    role: "member",
    status: "pending",
    expiresAt: daysAgo(-6),
    organizationId: "ws_acme",
    organizationName: "Acme Research",
    inviterEmail: "you@company.com",
  },
];
export const INVITATION = INVITATIONS[0]!;

/** What Stripe reports for the checkout session the success page reads. */
export const CHECKOUT_SESSION: CheckoutSessionSummary = {
  status: "complete",
  isSubscriptionActive: true,
  planName: "Pro",
  billingInterval: "month",
  customerEmail: USER.email,
};

// Showcase copy, not engine input: the numbers here exist to match the
// feature bullets beside them ("1,000 credits / month"), and nothing in
// the preview enforces a quota. The allowance the engine reads is
// `PlanConfig.monthlyAllowance`, an amount that names its currency.
const limits = (monthlyCredits: number, members: number) => ({
  monthlyCredits,
  rolloverEnabled: false,
  teamMembers: members,
});

export const PLANS: Record<string, PlanConfig> = {
  free: {
    name: "Free",
    slug: "free",
    description: "Try the product on a small monthly allowance.",
    priceOneTime: 0,
    priceMonthly: 0,
    priceYearly: 0,
    targetAudience: "Individuals",
    aiModelLabel: "Standard models",
    limits: limits(1_000, 1),
    features: [
      "1,000 credits / month",
      "1 workspace member",
      "Community support",
    ],
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "For people who use it every day.",
    priceOneTime: 0,
    priceMonthly: 29,
    priceYearly: 290,
    targetAudience: "Professionals",
    aiModelLabel: "Frontier models",
    limits: limits(25_000, 5),
    features: [
      "25,000 credits / month",
      "5 workspace members",
      "Artifacts & exports",
      "Priority support",
    ],
  },
  team: {
    name: "Team",
    slug: "team",
    description: "Shared workspaces, admin console, audit trail.",
    priceOneTime: 0,
    priceMonthly: 99,
    priceYearly: 990,
    targetAudience: "Teams",
    aiModelLabel: "Frontier models",
    limits: limits(120_000, 25),
    features: [
      "120,000 credits / month",
      "25 workspace members",
      "Role-based access",
      "Audit log & impersonation",
      "SSO (soon)",
    ],
  },
};

export const RECENT: RecentConversation[] = [
  { id: "conv_1", title: "Q3 support tickets", updatedAt: daysAgo(0, 1) },
  { id: "conv_2", title: "Pricing audit", updatedAt: daysAgo(1) },
  { id: "conv_3", title: "Onboarding copy review", updatedAt: daysAgo(4) },
];

export const CHAT_MESSAGES: UIMessage[] = [
  {
    id: "m1",
    role: "user",
    parts: [
      { type: "text", text: "What's in this quarter's support tickets?" },
    ],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Three themes dominate the 412 tickets since July:\n\n1. **Onboarding friction** (38%) — the workspace-name step is where people stall.\n2. **Billing questions** (27%) — mostly about credit rollover.\n3. **Export requests** (19%) — CSV of usage per member.\n\nWant me to draft a reply template for each?",
      },
    ],
  },
];

export const RESUME = { href: "/chat/conv_1", label: "Q3 support tickets" };
