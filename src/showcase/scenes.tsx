/**
 * Every scene is the real registry item — the same files `shadcn add`
 * installs — composed the way its page composes them, with fixture data
 * in place of the packages' reads. Nothing here is a mock-up.
 */
import { useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";

import { AuthCard } from "@showcase/components/auth/auth-card";
import { LoginForm } from "@showcase/components/auth/login-form";
import { SignupForm } from "@showcase/components/auth/signup-form";
import { SocialLoginButtons } from "@showcase/components/auth/social-login-buttons";
import { ResendVerificationButton } from "@showcase/components/auth/resend-verification-button";
import { OnboardingWizard } from "@showcase/components/onboarding/onboarding-wizard";
import { AppSidebar } from "@showcase/components/shell/app-sidebar";
import { ShellHeader } from "@showcase/components/shell/shell-header";
import { SidebarInset, SidebarProvider } from "@showcase/components/ui/sidebar";
import { DashboardHero } from "@showcase/components/dashboard/dashboard-hero";
import { PromptBar } from "@showcase/components/dashboard/prompt-bar";
import { RecentConversations } from "@showcase/components/dashboard/recent-conversations";
import { InviteMemberForm } from "@showcase/components/team/invite-member-form";
import { MemberList } from "@showcase/components/team/member-list";
import { PendingInvitations } from "@showcase/components/team/pending-invitations";
import { PricingContent } from "@showcase/components/billing/pricing-content";
import { CreditBundles } from "@showcase/components/billing/credit-bundles";
import { PortalButton } from "@showcase/components/billing/portal-button";
import { UsageSummaryCards } from "@showcase/components/usage/usage-summary-cards";
import { UsageChart } from "@showcase/components/usage/usage-chart";
import { NotificationList } from "@showcase/components/notifications/notification-list";
import { MessageList } from "@showcase/components/chat/message-list";
import { ChatInput } from "@showcase/components/chat/chat-input";
import { ConversationSidebar } from "@showcase/components/chat/conversation-sidebar";
import { DocumentList } from "@showcase/components/artifacts/document-list";
import { TrialBanner } from "@showcase/components/trial/trial-banner";
import { PaywallBlur } from "@showcase/components/billing/paywall-blur";
import { UpgradePrompt } from "@showcase/components/billing/upgrade-prompt";
import { Card, CardContent, CardHeader, CardTitle } from "@showcase/components/ui/card";

import { ShowcaseProvider, ScaledCanvas } from "./provider";
import { CHAT_MESSAGES, CONVERSATIONS, DOCUMENTS, INVITATIONS, MEMBERS, NOTIFICATIONS, PLANS, RECENT, RESUME, USAGE_OVERVIEW, USER, WORKSPACE, WORKSPACES } from "./fixtures";

export type SceneId =
  | "login"
  | "signup"
  | "verify"
  | "onboarding"
  | "dashboard"
  | "team"
  | "pricing"
  | "billing-settings"
  | "usage"
  | "notifications"
  | "chat"
  | "artifacts"
  | "trial-banner"
  | "feature-gating";

/** Which scene shows a registry item; items without one fall back to the explorer's sketch. */
export const SCENE_FOR_ITEM: Partial<Record<string, SceneId>> = {
  "auth-login": "login",
  "auth-signup": "signup",
  "auth-email-verification": "verify",
  onboarding: "onboarding",
  "app-shell": "dashboard",
  dashboard: "dashboard",
  "team-settings": "team",
  pricing: "pricing",
  "billing-settings": "billing-settings",
  usage: "usage",
  notifications: "notifications",
  chat: "chat",
  artifacts: "artifacts",
  "trial-banner": "trial-banner",
  "feature-gating": "feature-gating",
};

const ROUTE: Record<SceneId, string> = {
  login: "/login",
  signup: "/signup",
  verify: "/verify-email",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  team: "/settings/team",
  pricing: "/pricing",
  "billing-settings": "/settings/billing",
  usage: "/usage",
  notifications: "/notifications",
  chat: "/chat/conv_1",
  artifacts: "/artifacts",
  "trial-banner": "/dashboard",
  "feature-gating": "/usage",
};

/* ---------- frames: the app-shell item around app pages, a centred card around auth ---------- */

function AppFrame({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  return (
    <SidebarProvider defaultOpen className="h-full min-h-0">
      <AppSidebar workspace={WORKSPACE} workspaces={WORKSPACES} user={USER} />
      <SidebarInset className="min-h-0 overflow-hidden">
        {banner}
        <ShellHeader />
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-muted/40 p-8">{children}</div>;
}

function PageHeading({ ns, title, description }: { ns: string; title: string; description?: string }) {
  const t = useTranslations(ns);
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold">{t(title)}</h1>
      {description && <p className="text-sm text-muted-foreground">{t(description)}</p>}
    </div>
  );
}

/* ---------- scenes ---------- */

function Login() {
  const t = useTranslations("auth-login");
  return (
    <AuthFrame>
      <div className="w-full max-w-md">
        <AuthCard title={t("card.title")} description={t("card.description")}>
          <div className="space-y-4">
            <SocialLoginButtons providers={["google", "github"]} />
            <LoginForm />
          </div>
        </AuthCard>
      </div>
    </AuthFrame>
  );
}

function Signup() {
  const t = useTranslations("auth-signup");
  return (
    <AuthFrame>
      <div className="w-full max-w-md">
        <AuthCard title={t("card.title")} description={t("card.description")}>
          <div className="space-y-4">
            <SocialLoginButtons providers={["google", "github"]} />
            <SignupForm />
          </div>
        </AuthCard>
      </div>
    </AuthFrame>
  );
}

function Verify() {
  const t = useTranslations("auth-email-verification");
  return (
    <AuthFrame>
      <div className="w-full max-w-md">
        <AuthCard title={t("pendingState.title")} description={t("pendingState.description")}>
          <ResendVerificationButton email={USER.email} />
        </AuthCard>
      </div>
    </AuthFrame>
  );
}

function Onboarding() {
  return (
    <AuthFrame>
      <div className="w-full max-w-lg">
        <OnboardingWizard initialStepId={null} />
      </div>
    </AuthFrame>
  );
}

function Dashboard() {
  return (
    <AppFrame>
      <div className="space-y-8 py-6">
        <DashboardHero resume={RESUME} />
        <PromptBar />
        <RecentConversations conversations={RECENT} />
      </div>
    </AppFrame>
  );
}

function Team() {
  return (
    <AppFrame>
      <PageHeading ns="team-settings" title="page.title" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <MemberList members={MEMBERS} currentUserId={USER.id} canManage />
          <PendingInvitations invitations={INVITATIONS} />
        </div>
        <InviteMemberForm />
      </div>
    </AppFrame>
  );
}

function Pricing() {
  return (
    <AppFrame>
      <PricingContent plans={PLANS} currentPlanSlug="free" canCheckout />
    </AppFrame>
  );
}

function BillingSettings() {
  const t = useTranslations("billing-settings");
  return (
    <AppFrame>
      <PageHeading ns="billing-settings" title="page.title" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("owner.currentPlanLabel")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-2xl font-semibold">Pro</div>
            <div className="text-sm text-muted-foreground">
              {t("owner.creditBalanceLabel")}: <span className="font-medium text-foreground">917</span> {t("owner.creditsUnit")}
            </div>
            <PortalButton>{t("owner.manageSubscription")}</PortalButton>
          </CardContent>
        </Card>
        <CreditBundles currentCredits={917} />
      </div>
    </AppFrame>
  );
}

function Usage() {
  return (
    <AppFrame>
      <PageHeading ns="usage" title="page.title" description="page.description" />
      <div className="space-y-6">
        <UsageSummaryCards initialPeriodSummary={USAGE_OVERVIEW.currentPeriod} plan={USAGE_OVERVIEW.plan} billingMode={USAGE_OVERVIEW.billingMode} quota={USAGE_OVERVIEW.quota} trial={USAGE_OVERVIEW.trial} />
        <UsageChart points={USAGE_OVERVIEW.daily} />
      </div>
    </AppFrame>
  );
}

function Notifications() {
  return (
    <AppFrame>
      <PageHeading ns="notifications" title="page.title" description="page.subtitle" />
      <div className="max-w-2xl">
        <NotificationList notifications={NOTIFICATIONS} variant="full" />
      </div>
    </AppFrame>
  );
}

function Chat() {
  const [messages] = useState(CHAT_MESSAGES);
  return (
    <AppFrame>
      <div className="-m-6 grid h-[calc(100%+3rem)] grid-cols-[260px_1fr]">
        <div className="border-r">
          <ConversationSidebar conversations={CONVERSATIONS} activeId="conv_1" />
        </div>
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            <MessageList messages={messages} isStreaming={false} />
          </div>
          <div className="border-t px-6 py-3">
            <ChatInput onSend={() => {}} onStop={() => {}} isStreaming={false} />
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

function Artifacts() {
  return (
    <AppFrame>
      <PageHeading ns="artifacts" title="page.heading" description="page.description" />
      <DocumentList documents={DOCUMENTS} />
    </AppFrame>
  );
}

function Trial() {
  return (
    <AppFrame banner={<TrialBanner daysRemaining={9} creditsRemaining={612} initialCredits={1000} />}>
      <div className="space-y-8 py-6">
        <DashboardHero resume={null} />
        <PromptBar />
      </div>
    </AppFrame>
  );
}

function FeatureGating() {
  return (
    <AppFrame>
      <PageHeading ns="usage" title="page.title" description="page.description" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <PaywallBlur isLocked>
          <UsageChart points={USAGE_OVERVIEW.daily} />
        </PaywallBlur>
        <UpgradePrompt feature="Usage export" requiredPlan="Pro" currentPlan="Free" />
      </div>
    </AppFrame>
  );
}

const SCENES: Record<SceneId, () => ReactNode> = {
  login: Login,
  signup: Signup,
  verify: Verify,
  onboarding: Onboarding,
  dashboard: Dashboard,
  team: Team,
  pricing: Pricing,
  "billing-settings": BillingSettings,
  usage: Usage,
  notifications: Notifications,
  chat: Chat,
  artifacts: Artifacts,
  "trial-banner": Trial,
  "feature-gating": FeatureGating,
};

/** A real page, scaled to whatever box it is given (position: relative on the parent). */
export function Showcase({ scene }: { scene: SceneId }) {
  const Scene = SCENES[scene];
  const auth = scene === "login" || scene === "signup" || scene === "verify" || scene === "onboarding";
  return (
    <ScaledCanvas width={auth ? 960 : 1180}>
      <ShowcaseProvider pathname={ROUTE[scene]}>
        <Scene />
      </ShowcaseProvider>
    </ScaledCanvas>
  );
}
