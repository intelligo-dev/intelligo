/**
 * Every scene is the real registry item — the same files `shadcn add`
 * installs — composed the way its page composes them, with fixture data
 * in place of the packages' reads. Nothing here is a mock-up.
 *
 * One exception is explained where it happens: `checkout` ships no client
 * component (its page is a server component reading Stripe), so that
 * scene mirrors the page's JSX with the item's own messages.
 */
import { useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { CheckCircle2 } from "lucide-react";

import { AuthCard } from "@showcase/components/auth/auth-card";
import { LoginForm } from "@showcase/components/auth/login-form";
import { SignupForm } from "@showcase/components/auth/signup-form";
import { SocialLoginButtons } from "@showcase/components/auth/social-login-buttons";
import { ResendVerificationButton } from "@showcase/components/auth/resend-verification-button";
import { ForgotPasswordForm } from "@showcase/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@showcase/components/auth/reset-password-form";
import { OnboardingWizard } from "@showcase/components/onboarding/onboarding-wizard";
import { InvitationActions } from "@showcase/components/invitation/invitation-actions";
import { AppSidebar } from "@showcase/components/shell/app-sidebar";
import { ShellHeader } from "@showcase/components/shell/shell-header";
import { SidebarInset, SidebarProvider } from "@showcase/components/ui/sidebar";
import { DashboardHero } from "@showcase/components/dashboard/dashboard-hero";
import { PromptBar } from "@showcase/components/dashboard/prompt-bar";
import { RecentConversations } from "@showcase/components/dashboard/recent-conversations";
import { SettingsTabs } from "@showcase/components/settings/settings-tabs";
import { InviteMemberForm } from "@showcase/components/team/invite-member-form";
import { MemberList } from "@showcase/components/team/member-list";
import { PendingInvitations } from "@showcase/components/team/pending-invitations";
import { RoleBadge } from "@showcase/components/team/role-badge";
import { WorkspaceSettingsForm } from "@showcase/components/workspace/workspace-settings-form";
import { ProfileSettingsForm } from "@showcase/components/profile/profile-settings-form";
import { ExportDataButton } from "@showcase/components/privacy/export-data-button";
import { FactList } from "@showcase/components/privacy/fact-list";
import { PricingContent } from "@showcase/components/billing/pricing-content";
import { CreditBundles } from "@showcase/components/billing/credit-bundles";
import { PortalButton } from "@showcase/components/billing/portal-button";
import { LocalPaymentModal } from "@showcase/components/billing/local-payment-modal";
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
import { LanguageSwitcher } from "@showcase/components/layout/language-switcher";
import { RouteError } from "@showcase/components/shared/route-error";
import { Badge } from "@showcase/components/ui/badge";
import { Button } from "@showcase/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@showcase/components/ui/card";
import { Link } from "@showcase/i18n/navigation";
import { routing } from "@showcase/i18n/routing";

import { ShowcaseProvider, ScaledCanvas } from "./provider";
import {
  AUDIT_TRAIL,
  CHAT_MESSAGES,
  CHECKOUT_SESSION,
  CONVERSATIONS,
  DOCUMENTS,
  FACTS,
  INVITATION,
  INVITATIONS,
  MEMBERS,
  NOTIFICATIONS,
  PLANS,
  RECENT,
  RESUME,
  USAGE_OVERVIEW,
  USER,
  WORKSPACE,
  WORKSPACES,
} from "./fixtures";

export type SceneId =
  | "login"
  | "signup"
  | "verify"
  | "password-reset"
  | "onboarding"
  | "invitation"
  | "dashboard"
  | "team"
  | "settings-profile"
  | "settings-workspace"
  | "settings-privacy"
  | "pricing"
  | "billing-settings"
  | "checkout-success"
  | "payment-poll"
  | "usage"
  | "notifications"
  | "chat"
  | "artifacts"
  | "trial-banner"
  | "feature-gating"
  | "language-switcher"
  | "route-error";

/** Which scene shows a registry item. Two items can share a scene when one is the frame the other renders in. */
export const SCENE_FOR_ITEM: Partial<Record<string, SceneId>> = {
  "auth-login": "login",
  "auth-signup": "signup",
  "auth-email-verification": "verify",
  "auth-password-reset": "password-reset",
  onboarding: "onboarding",
  "invitation-accept": "invitation",
  "app-shell": "dashboard",
  dashboard: "dashboard",
  "settings-shell": "settings-profile",
  "profile-settings": "settings-profile",
  "workspace-settings": "settings-workspace",
  "privacy-settings": "settings-privacy",
  "team-settings": "team",
  pricing: "pricing",
  "billing-settings": "billing-settings",
  checkout: "checkout-success",
  "payment-poll": "payment-poll",
  usage: "usage",
  notifications: "notifications",
  chat: "chat",
  artifacts: "artifacts",
  "trial-banner": "trial-banner",
  "feature-gating": "feature-gating",
  "language-switcher": "language-switcher",
  "route-error": "route-error",
};

/** The pathname (query included) each scene believes it is at — active links, tabs and `useSearchParams` read it. */
const ROUTE: Record<SceneId, string> = {
  login: "/login",
  signup: "/signup",
  verify: "/verify-email",
  "password-reset": "/reset-password?token=preview",
  onboarding: "/onboarding",
  invitation: "/accept-invitation/inv_sam",
  dashboard: "/dashboard",
  team: "/settings/team",
  "settings-profile": "/settings/profile",
  "settings-workspace": "/settings/workspace",
  "settings-privacy": "/settings/privacy",
  pricing: "/pricing",
  "billing-settings": "/settings/billing",
  "checkout-success": "/checkout/success?session_id=cs_preview",
  "payment-poll": "/pricing",
  usage: "/usage",
  notifications: "/notifications",
  chat: "/chat/conv_1",
  artifacts: "/artifacts",
  "trial-banner": "/dashboard",
  "feature-gating": "/usage",
  "language-switcher": "/dashboard",
  "route-error": "/dashboard",
};

/* ---------- frames: the app-shell item around app pages, a centred card around auth ---------- */

function AppFrame({
  children,
  banner,
}: {
  children: ReactNode;
  banner?: ReactNode;
}) {
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
  return (
    <div className="flex h-full items-center justify-center bg-muted/40 p-8">
      {children}
    </div>
  );
}

/** The settings-shell item's layout: every `/settings/*` page renders under this heading and tab bar. */
function SettingsFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("settings-shell");
  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <SettingsTabs />
        <div>{children}</div>
      </div>
    </AppFrame>
  );
}

function PageHeading({
  ns,
  title,
  description,
  compact = false,
}: {
  ns: string;
  title: string;
  description?: string;
  /** The settings pages use a smaller heading under the shell's own "Settings" h1. */
  compact?: boolean;
}) {
  const t = useTranslations(ns);
  return (
    <div className={compact ? undefined : "mb-6"}>
      <h1
        className={compact ? "text-lg font-semibold" : "text-2xl font-semibold"}
      >
        {t(title)}
      </h1>
      {description && (
        <p className="text-sm text-muted-foreground">{t(description)}</p>
      )}
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
        <AuthCard
          title={t("pendingState.title")}
          description={t("pendingState.description")}
        >
          <ResendVerificationButton email={USER.email} />
        </AuthCard>
      </div>
    </AuthFrame>
  );
}

/** Both pages of the item side by side; the route carries `?token=preview`, so the reset form shows its fields. */
function PasswordReset() {
  const t = useTranslations("auth-password-reset");
  return (
    <AuthFrame>
      <div className="grid w-full max-w-4xl grid-cols-2 items-start gap-6">
        <AuthCard
          title={t("forgotPage.card.title")}
          description={t("forgotPage.card.description")}
        >
          <ForgotPasswordForm />
        </AuthCard>
        <AuthCard
          title={t("resetPage.card.title")}
          description={t("resetPage.card.description")}
        >
          <ResetPasswordForm />
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

/** The item's page: the invitation card the server renders around `InvitationActions`. */
function Invitation() {
  const t = useTranslations("invitation-accept");
  const format = useFormatter();
  return (
    <AppFrame>
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("card.title")}</CardTitle>
            <CardDescription>{t("card.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("card.workspaceLabel")}
                </p>
                <p className="text-base font-semibold">
                  {INVITATION.organizationName ?? t("card.workspaceFallback")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("card.invitedByLabel")}
                </p>
                <p className="text-base">
                  {INVITATION.inviterEmail ?? t("card.invitedByFallback")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("card.roleLabel")}
                </p>
                <div className="mt-1">
                  <RoleBadge role={INVITATION.role} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("card.expiresLabel")}
                </p>
                <p className="text-base">
                  {format.dateTime(new Date(INVITATION.expiresAt), {
                    dateStyle: "medium",
                  })}
                </p>
              </div>
            </div>
            <InvitationActions invitationId={INVITATION.id} />
          </CardContent>
        </Card>
      </div>
    </AppFrame>
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
    <SettingsFrame>
      <div className="space-y-6">
        <PageHeading ns="team-settings" title="page.title" compact />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <MemberList members={MEMBERS} currentUserId={USER.id} canManage />
            <PendingInvitations invitations={INVITATIONS} />
          </div>
          <InviteMemberForm />
        </div>
      </div>
    </SettingsFrame>
  );
}

function SettingsProfile() {
  return (
    <SettingsFrame>
      <div className="max-w-2xl space-y-6">
        <PageHeading
          ns="profile-settings"
          title="page.title"
          description="page.description"
          compact
        />
        <ProfileSettingsForm
          user={{ name: USER.name, email: USER.email, image: USER.image }}
        />
      </div>
    </SettingsFrame>
  );
}

function SettingsWorkspace() {
  return (
    <SettingsFrame>
      <div className="space-y-6">
        <PageHeading
          ns="workspace-settings"
          title="page.title"
          description="page.description"
          compact
        />
        <WorkspaceSettingsForm workspace={WORKSPACE} canEdit isOwner />
      </div>
    </SettingsFrame>
  );
}

/** The item's page: three cards, the third rendered inline by the page itself. */
function SettingsPrivacy() {
  const t = useTranslations("privacy-settings");
  const format = useFormatter();
  return (
    <SettingsFrame>
      <div className="max-w-2xl space-y-6">
        <PageHeading
          ns="privacy-settings"
          title="page.title"
          description="page.description"
          compact
        />
        <Card>
          <CardHeader>
            <CardTitle>{t("page.export.title")}</CardTitle>
            <CardDescription>{t("page.export.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportDataButton />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("page.yourData.title")}</CardTitle>
            <CardDescription>{t("page.yourData.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FactList initialFacts={FACTS} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("page.auditTrail.title")}</CardTitle>
            <CardDescription>
              {t("page.auditTrail.description", { count: AUDIT_TRAIL.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {AUDIT_TRAIL.map((row) => (
                <li key={row.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium capitalize">
                      {row.action} · {row.targetKind}
                    </span>
                    <time
                      dateTime={new Date(row.createdAt).toISOString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {format.dateTime(new Date(row.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {row.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </SettingsFrame>
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
    <SettingsFrame>
      <div className="space-y-6">
        <PageHeading ns="billing-settings" title="page.title" compact />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("owner.currentPlanLabel")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-semibold">Pro</div>
              <div className="text-sm text-muted-foreground">
                {t("owner.creditBalanceLabel")}:{" "}
                <span className="font-medium text-foreground">917</span>{" "}
                {t("owner.creditsUnit")}
              </div>
              <PortalButton>{t("owner.manageSubscription")}</PortalButton>
            </CardContent>
          </Card>
          <CreditBundles currentCredits={917} />
        </div>
      </div>
    </SettingsFrame>
  );
}

/**
 * The checkout item ships only a server page: it reads the Stripe session
 * through `@intelligo-dev/billing` and renders one of four cards. This is
 * that page's success branch with the read replaced by a fixture — the
 * markup follows `success-page.tsx` and every string is the item's own
 * `messages/en/checkout.json`.
 */
function CheckoutSuccess() {
  const t = useTranslations("checkout");
  const session = CHECKOUT_SESSION;
  return (
    <AppFrame>
      <div className="container max-w-2xl py-16">
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-3xl">{t("success.title")}</CardTitle>
            <CardDescription className="text-base">
              {session.planName
                ? t("success.planActive", { planName: session.planName })
                : t("success.subscriptionActive")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between">
                <div>
                  {session.planName && (
                    <p className="font-medium">
                      {t("success.planLabel", { planName: session.planName })}
                    </p>
                  )}
                  {session.billingInterval && (
                    <p className="text-sm text-muted-foreground">
                      {session.billingInterval === "month"
                        ? t("success.billedMonthly")
                        : t("success.billedYearly")}
                    </p>
                  )}
                </div>
                <Badge variant="default" className="bg-green-600">
                  {t("success.status")}
                </Badge>
              </div>
            </div>
            {session.customerEmail && (
              <p className="text-center text-sm text-muted-foreground">
                {t("success.receiptSent", { email: session.customerEmail })}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="w-full sm:flex-1"
              render={<Link href="/dashboard" />}
              nativeButton={false}
            >
              {t("actions.goToDashboard")}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              render={<Link href="/settings/billing" />}
              nativeButton={false}
            >
              {t("actions.viewBillingSettings")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </AppFrame>
  );
}

/** The modal a pricing page opens for a local bank payment; the preview's provider confirms on the second poll. */
function PaymentPoll() {
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const format = useFormatter();
  const plan = PLANS.pro!;
  const monthly = plan.priceMonthly ?? 0;
  const price = format.number(monthly, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  return (
    <AppFrame>
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-semibold">
              {price}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / month
              </span>
            </div>
            {paid ? (
              <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                {plan.name} is active.
              </p>
            ) : (
              <Button className="w-full" onClick={() => setOpen(true)}>
                Pay with your bank app
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <LocalPaymentModal
        open={open}
        onClose={() => setOpen(false)}
        reference="pro-monthly"
        amount={monthly}
        label={`${plan.name} plan`}
        onPaid={() => {
          setOpen(false);
          setPaid(true);
        }}
      />
    </AppFrame>
  );
}

function Usage() {
  return (
    <AppFrame>
      <PageHeading
        ns="usage"
        title="page.title"
        description="page.description"
      />
      <div className="space-y-6">
        <UsageSummaryCards
          initialPeriodSummary={USAGE_OVERVIEW.currentPeriod}
          plan={USAGE_OVERVIEW.plan}
          billingMode={USAGE_OVERVIEW.billingMode}
          quota={USAGE_OVERVIEW.quota}
          trial={USAGE_OVERVIEW.trial}
        />
        <UsageChart points={USAGE_OVERVIEW.daily} />
      </div>
    </AppFrame>
  );
}

function Notifications() {
  return (
    <AppFrame>
      <PageHeading
        ns="notifications"
        title="page.title"
        description="page.subtitle"
      />
      <div className="max-w-2xl">
        <NotificationList notifications={NOTIFICATIONS} variant="full" />
      </div>
    </AppFrame>
  );
}

function Chat() {
  const [messages] = useState(CHAT_MESSAGES);
  const [draft, setDraft] = useState("");
  return (
    <AppFrame>
      <div className="-m-6 grid h-[calc(100%+3rem)] grid-cols-[260px_1fr]">
        <ConversationSidebar
          conversations={CONVERSATIONS}
          activeId="conv_1"
          className="flex"
        />
        <div className="flex min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageList
              conversationId="conv_1"
              messages={messages}
              isStreaming={false}
            />
          </div>
          <ChatInput
            conversationId="conv_1"
            value={draft}
            onChange={setDraft}
            onSend={() => setDraft("")}
            onStop={() => {}}
            isStreaming={false}
          />
        </div>
      </div>
    </AppFrame>
  );
}

function Artifacts() {
  return (
    <AppFrame>
      <PageHeading
        ns="artifacts"
        title="page.heading"
        description="page.description"
      />
      <DocumentList documents={DOCUMENTS} />
    </AppFrame>
  );
}

function Trial() {
  return (
    <AppFrame
      banner={
        <TrialBanner
          daysRemaining={9}
          creditsRemaining={612}
          initialCredits={1000}
        />
      }
    >
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
      <PageHeading
        ns="usage"
        title="page.title"
        description="page.description"
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <PaywallBlur isLocked>
          <UsageChart points={USAGE_OVERVIEW.daily} />
        </PaywallBlur>
        <UpgradePrompt
          feature="Usage export"
          requiredPlan="Pro"
          currentPlan="Free"
        />
      </div>
    </AppFrame>
  );
}

/**
 * The switcher lists the locales the consumer's `i18n/routing.ts` declares
 * (two in the preview). `useLocale()` is the provider's "en"; choosing the
 * other one calls `router.replace(pathname, { locale })`, which in the
 * preview goes nowhere.
 */
function LanguageSwitcherScene() {
  const t = useTranslations("language-switcher");
  return (
    <AppFrame>
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("label")}</CardTitle>
            <CardDescription>
              {routing.locales.join(" · ")} — from your i18n/routing.ts
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <LanguageSwitcher />
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}

/** Module-level so the boundary's mount effect runs once; the message matches no classification rule, so the copy is `generic`. */
const PREVIEW_ERROR = Object.assign(
  new Error("Preview: the route boundary caught an error"),
  { digest: "preview" }
);

/** The boundary component every `error.tsx` in the registry renders. It logs to the console on mount by design. */
function RouteErrorScene() {
  return (
    <AppFrame>
      <RouteError error={PREVIEW_ERROR} reset={() => {}} scope="preview" />
    </AppFrame>
  );
}

const SCENES: Record<SceneId, () => ReactNode> = {
  login: Login,
  signup: Signup,
  verify: Verify,
  "password-reset": PasswordReset,
  onboarding: Onboarding,
  invitation: Invitation,
  dashboard: Dashboard,
  team: Team,
  "settings-profile": SettingsProfile,
  "settings-workspace": SettingsWorkspace,
  "settings-privacy": SettingsPrivacy,
  pricing: Pricing,
  "billing-settings": BillingSettings,
  "checkout-success": CheckoutSuccess,
  "payment-poll": PaymentPoll,
  usage: Usage,
  notifications: Notifications,
  chat: Chat,
  artifacts: Artifacts,
  "trial-banner": Trial,
  "feature-gating": FeatureGating,
  "language-switcher": LanguageSwitcherScene,
  "route-error": RouteErrorScene,
};

/** A real page, scaled to whatever box it is given (position: relative on the parent). */
export function Showcase({
  scene,
  toaster,
}: {
  scene: SceneId;
  toaster?: boolean;
}) {
  const Scene = SCENES[scene];
  const auth =
    scene === "login" ||
    scene === "signup" ||
    scene === "verify" ||
    scene === "password-reset" ||
    scene === "onboarding";
  return (
    <ScaledCanvas width={auth ? 960 : 1180}>
      <ShowcaseProvider pathname={ROUTE[scene]} toaster={toaster}>
        <Scene />
      </ShowcaseProvider>
    </ScaledCanvas>
  );
}
