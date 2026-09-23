/**
 * The role-shaped billing read: what a member, an admin and an owner may
 * each see of the workspace's plan and balance.
 *
 * Takes the resolved `role`; the transport MUST resolve it with
 * `requireWorkspace()` first (billing cannot depend on auth).
 */

import { z } from "zod";

import { money, type Money } from "@intelligo-dev/core/money";

import { getWorkspaceBilling } from "./queries";

export type BillingRole = "member" | "admin" | "owner";

export type BillingOverviewMember = {
  role: "member";
  /**
   * The catalogue name of the workspace's plan, `null` when it has none.
   * Copy for the no-plan case is the page's, in the reader's language.
   */
  planName: string | null;
  /**
   * Which plan is current, so a pricing page can mark it and a page can
   * look up its translated name; `"free"` when the workspace has none.
   */
  planSlug: string;
  status: string;
};

export type BillingOverviewAdmin = {
  role: "admin";
  planName: string | null;
  planSlug: string;
};

export type BillingOverviewOwner = {
  role: "owner";
  planName: string | null;
  planSlug: string;
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
  } | null;
  /**
   * The top-up balance, in the deployment's billing currency. `null`
   * when the workspace has no ledger row to denominate.
   */
  creditBalance: Money | null;
  billingMode: "subscription" | "credit";
};

export type BillingOverview =
  BillingOverviewMember | BillingOverviewAdmin | BillingOverviewOwner;

const billingOverviewSchema = z.object({
  workspaceId: z.string().min(1),
  role: z.enum(["member", "admin", "owner"]),
});

export type GetBillingOverviewInput = z.infer<typeof billingOverviewSchema>;

/**
 * Role-shaped billing read: `member` gets a status-only view, `admin`
 * a read-only plan name, `owner` the full subscription/credit-balance
 * detail. The caller resolves `role` from `requireWorkspace()`'s
 * membership — this module never reads a role for itself.
 */
export async function getBillingOverview(
  input: GetBillingOverviewInput
): Promise<BillingOverview> {
  const { workspaceId, role } = billingOverviewSchema.parse(input);

  const billing = await getWorkspaceBilling(workspaceId);
  const planName = billing.plan?.name ?? null;
  const planSlug = billing.plan?.slug ?? "free";

  if (role === "member") {
    return {
      role: "member",
      planName,
      planSlug,
      status: billing.subscription?.status ?? "active",
    };
  }

  if (role === "admin") {
    return { role: "admin", planName, planSlug };
  }

  return {
    role: "owner",
    planName,
    planSlug,
    subscription: billing.subscription
      ? {
          status: billing.subscription.status,
          currentPeriodEnd: billing.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: billing.subscription.cancelAtPeriodEnd,
          stripeCustomerId: billing.subscription.stripeCustomerId,
        }
      : null,
    creditBalance: billing.creditBalance.currency
      ? money(
          billing.creditBalance.balanceMicros,
          billing.creditBalance.currency
        )
      : null,
    billingMode: billing.billingMode,
  };
}
