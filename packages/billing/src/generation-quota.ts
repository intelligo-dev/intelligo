/**
 * Generation Quota Enforcement
 *
 * Completely separate from the token-based quota system (quota.ts).
 * Image generations are billed per-image-per-day, not per-token.
 * This module enforces daily generation limits before any OpenAI call is made,
 * preventing unbilled usage.
 *
 * Functions:
 * - checkGenerationQuota: Pre-flight check before image generation request
 * - recordGeneration: Insert row into imageGenerations table after generation
 * - getGenerationUsage: Convenience function for UI quota counters
 *
 * Daily limits by plan (resets at UTC midnight):
 * - free: 0 (AI Tools is a pro+ feature)
 * - pro: 10 images per day
 * - enterprise: 50 images per day
 *
 * Pattern: Server-side only, used by /api/tools/generate route handler.
 */

import { db } from "@intelligo/core/db";
import { imageGenerations } from "@intelligo/core/db/schema";
import { eq, and, gte, ne, sql } from "drizzle-orm";
import { getWorkspaceBilling } from "./queries";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GenerationQuotaResult = {
  allowed: boolean;
  reason?: string;
  usage: { used: number; limit: number; remaining: number };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the start of today in UTC (midnight) */
function getTodayStartUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/**
 * Resolve the daily generation limit for a plan slug.
 * Falls back to free plan limit (0) if plan slug is unknown.
 */
function getPlanGenerationLimit(_planSlug: string | null | undefined): number {
  // Image generation not used in Support Assistant — always 0
  return 0;
}

/**
 * Count today's image generations for a workspace.
 * Excludes failed generations from the quota count.
 */
async function getDailyGenerationCount(workspaceId: string): Promise<number> {
  const todayStart = getTodayStartUTC();

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(imageGenerations)
    .where(
      and(
        eq(imageGenerations.workspaceId, workspaceId),
        gte(imageGenerations.createdAt, todayStart),
        ne(imageGenerations.status, "failed")
      )
    );

  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// checkGenerationQuota (AT-GEN-05)
// ---------------------------------------------------------------------------

/**
 * Check whether a workspace is allowed to generate another image today.
 *
 * Returns allowed:false immediately when the workspace has reached or exceeded
 * their daily limit, preventing any OpenAI API call from being made.
 *
 * Note: Does NOT call recordTokenUsage — generation quota is completely
 * independent of token billing.
 */
export async function checkGenerationQuota(
  workspaceId: string,
  count: number = 1
): Promise<GenerationQuotaResult> {
  const billing = await getWorkspaceBilling(workspaceId);
  const planSlug = billing.plan?.slug ?? "free";
  const limit = getPlanGenerationLimit(planSlug);

  const used = await getDailyGenerationCount(workspaceId);

  const remaining = Math.max(0, limit - used);
  if (remaining < count) {
    return {
      allowed: false,
      reason:
        count > 1
          ? `Batch of ${count} exceeds remaining quota. You have ${remaining} generation${remaining === 1 ? "" : "s"} left today (limit: ${limit}).`
          : `Daily image generation limit reached. Your plan allows ${limit} generation${limit === 1 ? "" : "s"} per day.`,
      usage: { used, limit, remaining },
    };
  }

  return {
    allowed: true,
    usage: { used, limit, remaining },
  };
}

// ---------------------------------------------------------------------------
// recordGeneration (AT-GEN-05)
// ---------------------------------------------------------------------------

export type RecordGenerationParams = {
  workspaceId: string;
  userId: string;
  toolId: string;
  prompt: string;
  resultUrl: string | null;
  model: string;
  status: "completed" | "failed";
  errorMessage?: string;
};

/**
 * Record an image generation attempt in the imageGenerations table.
 *
 * Called after generation completes (success or failure).
 * Failed generations are recorded but excluded from daily quota counts
 * (getDailyGenerationCount filters out status='failed').
 *
 * Returns the inserted row id.
 */
export async function recordGeneration(
  params: RecordGenerationParams
): Promise<string> {
  const id = crypto.randomUUID();

  await db.insert(imageGenerations).values({
    id,
    workspaceId: params.workspaceId,
    userId: params.userId,
    toolId: params.toolId,
    prompt: params.prompt,
    resultUrl: params.resultUrl,
    model: params.model,
    status: params.status,
    errorMessage: params.errorMessage,
  });

  return id;
}

// ---------------------------------------------------------------------------
// getGenerationUsage (AT-GEN-05)
// ---------------------------------------------------------------------------

/**
 * Get daily generation usage for a workspace.
 *
 * Convenience function for the UI to display quota counters.
 * Combines plan limit lookup with daily count in a single call.
 */
export async function getGenerationUsage(
  workspaceId: string
): Promise<{ used: number; limit: number; remaining: number }> {
  const billing = await getWorkspaceBilling(workspaceId);
  const planSlug = billing.plan?.slug ?? "free";
  const limit = getPlanGenerationLimit(planSlug);
  const used = await getDailyGenerationCount(workspaceId);

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}
