---
title: Plans, features and quotas
description: Define your plans, gate a feature to a plan on the server, cap how often it runs, and show an upgrade prompt when a workspace hits the limit.
order: 3
---

A new app already has a `free` and a `pro` plan in `lib/plans.ts`, registered by the composition root, and the chat route is gated on the `chat` feature. By the end of this page a feature of your own is gated, capped and wrapped in an upgrade prompt.

## Define your plans

`lib/plans.ts` exports two objects: the plan catalogue and the feature matrix. `composeIntelligo()` in `lib/intelligo.ts` hands both to the billing engine with `registerProductPlans` and `registerProductFeatures`, after `setDefaultProductSlug` names the product they belong to. Setting `INTELLIGO_BILLING_PRODUCT` does the same as that call. With neither, billing throws `BillingNotConfiguredError`.

```ts title="lib/plans.ts"
export const PLANS: Record<string, PlanConfig> = {
  free: {
    // ...
    limits: { summaries: 5 },
  },
  pro: {
    name: "Pro",
    slug: "pro",
    description: "For daily use",
    priceOneTime: 20,
    priceMonthly: 20,
    priceYearly: 192,
    targetAudience: "Teams",
    aiModelLabel: "Advanced",
    monthlyAllowance: fromMajor(15, "USD"),
    limits: { summaries: -1 },
    features: ["Unlimited summaries", "Exports"],
  },
};
```

| Field                                         | What it is                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`, `name`, `description`                 | Identity and card copy. Keep a plan with the slug `free`: a workspace with no subscription resolves to it.                                              |
| `priceOneTime`, `priceMonthly`, `priceYearly` | Display prices as plain numbers in the `CURRENCY` of `lib/billing-config.ts`. Declaring an interval price shows the pricing page's toggle.              |
| `monthlyAllowance`                            | What the plan grants each period, as money with its currency. The credit engine enforces it: see [Credits and money](/docs/concepts/credits-and-money). |
| `limits`                                      | Your own keys, numeric caps. `-1` is unlimited; a missing key is `0`.                                                                                   |
| `features`                                    | Bullet copy for the pricing card, rendered verbatim. These are not feature keys.                                                                        |
| `targetAudience`, `aiModelLabel`              | Card copy, in your product's words.                                                                                                                     |
| `stripePriceIdMonthly`, `stripePriceIdYearly` | The Stripe prices checkout charges. See [Billing with Stripe](/docs/guides/billing-stripe).                                                             |

## Gate a feature on the server

A feature key is a string you choose. The matrix says which plan slugs grant it:

<!-- snippet: packages/cli/templates/app-scaffold/plans.ts.tpl#FEATURES -->

```ts title="lib/plans.ts"
export const FEATURES: Record<string, readonly string[]> = {
  assistant: ["free", "pro"],
  // POST /api/chat (the `chat` registry item). Every plan, so a clean
  // install can chat with no configuration; tighten to ["pro"] to put
  // chat behind a paywall.
  chat: ["free", "pro"],
};
```

Add `exports: ["pro"]` and check it wherever the feature runs, after `requireWorkspace` has resolved the tenant:

```ts title="actions/exports.ts"
"use server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { hasFeature } from "@intelligo-dev/billing";

export async function exportConversations() {
  const { workspace } = await requireWorkspace();
  if (!(await hasFeature(workspace.id, "exports"))) {
    return { success: false as const, error: "upgrade_required" };
  }
  // ...
}
```

`hasFeature(workspaceId, feature)` resolves the workspace's plan (its subscription's plan, `pro` during an active trial, `free` otherwise) and returns a boolean. `requireFeature` takes the same arguments and throws a plain `Error` instead. A key that is missing from the matrix is denied on every plan, so a registry item with a `featureKey` you have not added answers 403.

A row in the `feature_flags` table overrides the matrix for its feature name, and an inactive row turns the feature off for everyone. Answers are cached in-process for 60 seconds; `invalidateFeatureCache(workspaceId)` drops them.

## Cap how often a feature runs

`checkFeatureQuota(userId, workspaceId, plan, action)` compares a counter with the plan's limit. The limit is the key in `limits` named after the action — `summaries` above — unless `registerActionLimitKeys` maps the action to another key. `recordFeatureUsage(userId, workspaceId, action)` increments the counter in one SQL statement.

```ts title="actions/summaries.ts"
const { workspace, user } = await requireWorkspace();
const plan = await getWorkspacePlan(workspace.id);

const quota = await checkFeatureQuota(user.id, workspace.id, plan, "summaries");
if (!quota.allowed) return { success: false as const, quota };

const summary = await summarize(input);
await recordFeatureUsage(user.id, workspace.id, "summaries");
```

The result is a `FeatureQuotaResult`: `allowed`, `used`, `limit`, `remaining`, `percentage`, `nearingLimit` from 80 percent, and on refusal the `upgradeMessage` you registered with `registerUpgradeMessages`.

Counters are per user per workspace, and nothing resets them. They are lifetime caps until you clear the `usage` column of `user_quotas` yourself, for example from a monthly job.

## Limit team size

Seats per plan are their own map in `lib/plans.ts`, registered by the composition root with `registerTeamMemberLimits`. A seat count includes the owner, `-1` is unlimited, and a plan left out of the map has one seat, which refuses every invitation.

<!-- snippet: packages/cli/templates/app-scaffold/plans.ts.tpl#TEAM_MEMBER_LIMITS -->

```ts title="lib/plans.ts"
export const TEAM_MEMBER_LIMITS: Record<string, number> = {
  free: 3,
  pro: 25,
};
```

That call, like the trial and rate-limit calls below, is imported from `@intelligo-dev/billing/plans` and lives inside `composeIntelligo()`. `@intelligo-dev/auth` never imports billing: the `team-settings` block binds `checkTeamMemberLimit` as a port, and the team service calls it before it sends an invitation.

<!-- snippet: packages/registry/base/team-settings/lib/team.ts#team -->

```ts title="lib/team.ts"
export const team = createTeamService({
  checkMemberLimit: checkTeamMemberLimit,
  notifyMemberJoined: ({ workspaceId, memberName, memberEmail, ownerId }) =>
    triggerTeamMemberJoinedNotification({
      userId: ownerId,
      workspaceId,
      memberName,
      memberEmail,
    }),
});
```

## Show the upgrade prompt

Install [feature-gating](/blocks/feature-gating). `FeatureGate` is a server component, so gated content never reaches an unentitled browser:

```tsx title="app/[locale]/(app)/exports/page.tsx"
<FeatureGate workspaceId={workspace.id} feature="exports">
  <ExportsPanel />
</FeatureGate>
```

When the gate closes it renders `UpgradePrompt` (`variant="full"` or `"compact"`), or your `fallback`. `InlineUpgradeBanner` annotates a disabled control, `PaywallBlur` previews content, and `QuotaWarning` and `QuotaLimitDialog` take the `FeatureQuotaResult` from the previous section. The gate is not authorization: keep the check in the action.

| File                           | You set                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `lib/feature-catalog.ts`       | Per feature key: `labelKey`, `descriptionKey` (message keys) and `requiredPlan`. Unlisted keys get generic copy. |
| `lib/feature-gating-config.ts` | `upgradeHref` (default `/settings/billing`), `warnAtPercent` (80), `urgentAtPercent` (95).                       |

The [pricing](/blocks/pricing) block reads the same catalogue through `getPlans()` in `lib/billing.ts`, so a plan edited in `lib/plans.ts` changes the cards and the prompts together.

## Offer a trial

No template registers a trial, so none is granted. Register one:

```ts title="lib/intelligo.ts"
registerTrialConfig(PRODUCT_SLUG, {
  initialCredits: 100_000,
  grant: fromMajor(2, "USD"),
  durationDays: 14,
  warningThreshold: 0.2,
  reminderDaysBeforeExpiry: 3,
});
```

`grant` funds execution and must be in your billing currency; `initialCredits` is a display figure. Then grant it in `lib/workspace-bootstrap.ts`: replace the body of `onWorkspaceCreated` with `await provisionTrialCredits({ workspaceId, email })`.

## Set rate limits

`createChatHandler` limits each workspace to its plan's requests per minute. An unregistered plan gets 10.

```ts title="lib/intelligo.ts"
registerRateLimits(PRODUCT_SLUG, { free: 10, pro: 60 });
```

## Next

- [Billing with Stripe](/docs/guides/billing-stripe)
- [Credits and money](/docs/concepts/credits-and-money)
- [Composition root and ports](/docs/concepts/composition-root)
