import "server-only";

/**
 * Your composition root.
 *
 * This file is yours — Intelligo generated it once and will not
 * overwrite it. It is the single place the application wires itself
 * together: which plans exist, which features they grant, and how the
 * execution boundary reaches your billing implementation.
 *
 * Import-side-effect registration is deliberately not used: a
 * registration that silently does not happen looks exactly like one
 * that did.
 */

import {
  createBillingExecutions,
  ensureBillingSettingsRow,
  ensurePlanRows,
} from "@intelligo-dev/billing";
import { DEFAULT_MARGIN_BP } from "@intelligo-dev/executions/pricing";
import {
  registerProductFeatures,
  registerProductPlans,
  registerTeamMemberLimits,
  setDefaultProductSlug,
} from "@intelligo-dev/billing/plans";
import { setWorkspaceCreatedHandler } from "@intelligo-dev/auth";
import { assertEnv } from "@intelligo-dev/core/env";
import { setRequestContextSource } from "@intelligo-dev/core/request-context";
import {
  DEFAULT_MODELS,
  registerModels,
} from "@intelligo-dev/executions";
import { nextRequestContext } from "@intelligo-dev/next";
import { createLogger } from "@intelligo-dev/core/logger";

import { FEATURES, PLANS, TEAM_MEMBER_LIMITS } from "./plans";
import { onWorkspaceCreated } from "./workspace-bootstrap";

/** Identifies your product to the billing engine. */
export const PRODUCT_SLUG = "__APP_SLUG__";

/**
 * What your product can be asked to do. Capability strings are your
 * vocabulary — Intelligo only groups and meters them.
 */
export const CAPABILITIES = {
  assistantMessage: "assistant.message",
} as const;

const log = createLogger("Intelligo");

let composed = false;

export function composeIntelligo(): void {
  if (!composed) {
    composed = true;
    bind();
  }
  // Every call checks the seed, so a database that was unreachable at
  // boot is seeded by the first request after it comes back.
  seedIntelligo().catch((error: unknown) => {
    log.error("Seeding the plan and billing-settings rows failed", {
      error,
    });
  });
}

let seeding: Promise<void> | undefined;

/**
 * Writes the rows the registrations imply, and resolves once they
 * exist. Both writes are idempotent upserts, so processes that boot
 * together are safe; callers share one promise, and a failure clears
 * it so the next call tries again.
 */
export function seedIntelligo(): Promise<void> {
  seeding ??= Promise.all([
    // The plans table is a copy of the catalogue: a subscription row
    // references its plan there, so the rows exist before the first
    // checkout rather than being seeded by a migration.
    ensurePlanRows(),

    // What you bill in. Provider prices are USD, so a USD deployment
    // converts at exactly 1.0; selling in another currency means stating
    // its rate per USD here, in micros. There is no default rate — a
    // framework that guesses one is inventing money. The row is seeded once;
    // an existing row is left alone, because changing the currency under
    // a ledger that holds balances is your decision, not a deploy's.
    ensureBillingSettingsRow({
      currency: "USD",
      usdRateMicros: 1_000_000,
      marginBp: DEFAULT_MARGIN_BP,
    }),
  ]).then(
    () => undefined,
    (error: unknown) => {
      seeding = undefined;
      throw error;
    }
  );
  return seeding;
}

function bind(): void {
  // Fail on the first request rather than on the first query: a
  // missing DATABASE_URL or auth secret is a configuration error, not
  // something to discover deep inside a handler.
  assertEnv();

  // Where the framework reads the incoming request's headers from.
  // Only this line knows the app is a Next.js one; `@intelligo-dev/auth`
  // asks `@intelligo-dev/core/request-context` and stays usable from a
  // worker or a test.
  setRequestContextSource(nextRequestContext);

  // What a new user's personal workspace starts with.
  setWorkspaceCreatedHandler(onWorkspaceCreated);

  setDefaultProductSlug(PRODUCT_SLUG);
  registerProductPlans(PRODUCT_SLUG, PLANS);
  registerProductFeatures(PRODUCT_SLUG, FEATURES);
  registerTeamMemberLimits(PRODUCT_SLUG, TEAM_MEMBER_LIMITS);

  // What each model costs. The framework ships a catalogue as data and
  // registers none of it: an id with no registered price throws where
  // the price is needed, rather than being guessed. Swap in your own
  // contracted rates, or add a model the framework has never heard of,
  // by passing your own array here.
  registerModels(DEFAULT_MODELS);
}

// The execution boundary, bound to the billing engine: admission
// reserves the worst-case cost atomically, settlement records usage and
// deducts credits, reconcile() can tell a committed charge from none.
// Pass a port to replace one.
export const executions = createBillingExecutions();
