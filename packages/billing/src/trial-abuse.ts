import { db } from "@intelligo-dev/core/db";
import { trialCredits } from "@intelligo-dev/core/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Normalize an email address to a canonical form before comparing
 * it to the trial-history index. Without this, an attacker can
 * trivially defeat the per-email trial cap on Gmail / Google
 * Workspace by adding +aliases or dots:
 *
 *   alice@gmail.com
 *   alice+one@gmail.com
 *   a.l.i.c.e@gmail.com
 *   alice@googlemail.com
 *
 * all deliver to the same inbox but would otherwise register as
 * four distinct trial grants. We strip the +alias tag and, for
 * gmail/googlemail only, drop dots from the local part and rewrite
 * googlemail.com → gmail.com. Other providers don't uniformly
 * treat dots or plus as alias markers, so we leave them alone.
 */
export function normalizeEmailForAbuseCheck(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.indexOf("@");
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  const plusIdx = local.indexOf("+");
  if (plusIdx > 0) local = local.slice(0, plusIdx);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/**
 * Check for trial abuse by email and IP address.
 *
 * Limits:
 * - Max 3 trials per email address
 * - Max 5 trials per IP address (if provided)
 */
export async function checkTrialAbuse(
  email: string,
  ipAddress?: string
): Promise<{ allowed: boolean; reason?: string }> {
  const normalized = normalizeEmailForAbuseCheck(email);
  const emailCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(trialCredits)
    .where(eq(trialCredits.normalizedEmail, normalized));

  const emailTrials = Number(emailCount[0]?.count ?? 0);

  if (emailTrials >= 3) {
    return {
      allowed: false,
      reason: "Trial limit reached for this email",
    };
  }

  if (ipAddress) {
    const ipCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(trialCredits)
      .where(eq(trialCredits.createdByIp, ipAddress));

    const ipTrials = Number(ipCount[0]?.count ?? 0);
    if (ipTrials >= 5) {
      return {
        allowed: false,
        reason: "Trial limit reached",
      };
    }
  }

  return { allowed: true };
}
