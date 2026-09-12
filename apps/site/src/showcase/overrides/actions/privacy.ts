import type { UserFact } from "@intelligo-dev/core/db/schema";
import type {
  IdentityExport,
  UserMemoryAuditRow,
} from "@intelligo-dev/core/identity";
import { wait, TODAY, daysAgo } from "./_preview";

export type PrivacyActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const fact = (
  id: string,
  category: UserFact["category"],
  key: string,
  value: unknown,
  confidence: number,
  importance: number,
  ageDays: number
): UserFact => ({
  id,
  userId: "user_you",
  workspaceId: "ws_acme",
  category,
  key,
  value,
  confidence,
  importance,
  sourceProduct: null,
  sourceSessionId: null,
  sourceMessageId: null,
  extractionMethod: "llm_extraction",
  createdAt: new Date(daysAgo(ageDays)),
  lastConfirmedAt: null,
  expiresAt: null,
});

/** What the AI has learned about the preview's user, grouped by category in the list. */
export const FACTS: UserFact[] = [
  fact(
    "fact_role",
    "background",
    "role",
    "Product engineer at Acme Research",
    0.92,
    8,
    30
  ),
  fact(
    "fact_stack",
    "skill",
    "stack",
    "TypeScript, React, Postgres",
    0.88,
    7,
    21
  ),
  fact(
    "fact_goal",
    "goal",
    "q3",
    "Ship the customer-facing analytics dashboard by October",
    0.81,
    9,
    9
  ),
  fact(
    "fact_tone",
    "preference",
    "tone",
    "Short answers, code before prose",
    0.9,
    6,
    4
  ),
  fact(
    "fact_interest",
    "interest",
    "reading",
    "Distributed systems papers",
    0.64,
    3,
    2
  ),
];

export const AUDIT_TRAIL: UserMemoryAuditRow[] = [
  {
    id: "aud_3",
    userId: "user_you",
    workspaceId: "ws_acme",
    targetKind: "fact",
    targetId: "fact_interest",
    action: "create",
    actorKind: "agent",
    actorId: "assistant",
    beforeValue: null,
    afterValue: null,
    reason: "Mentioned in a conversation about SIGMOD",
    createdAt: new Date(daysAgo(2)),
  },
  {
    id: "aud_2",
    userId: "user_you",
    workspaceId: "ws_acme",
    targetKind: "fact",
    targetId: "fact_tone",
    action: "update",
    actorKind: "agent",
    actorId: "assistant",
    beforeValue: null,
    afterValue: null,
    reason: "Confidence raised after a second confirmation",
    createdAt: new Date(daysAgo(4)),
  },
  {
    id: "aud_1",
    userId: "user_you",
    workspaceId: "ws_acme",
    targetKind: "fact",
    targetId: "fact_old_city",
    action: "delete",
    actorKind: "user",
    actorId: "user_you",
    beforeValue: null,
    afterValue: null,
    reason: null,
    createdAt: new Date(daysAgo(11)),
  },
];

export async function listFacts(): Promise<UserFact[]> {
  return FACTS;
}
export async function getAuditTrail(): Promise<UserMemoryAuditRow[]> {
  return AUDIT_TRAIL;
}
export async function deleteFact(
  ..._args: unknown[]
): Promise<PrivacyActionResult> {
  await wait(300);
  return { success: true, data: undefined };
}
// Succeeds on purpose: the download is the feature, and it never leaves the page.
export async function exportIdentity(): Promise<
  PrivacyActionResult<IdentityExport>
> {
  await wait();
  return {
    success: true,
    data: {
      exportedAt: TODAY.toISOString(),
      user: { id: "user_you", workspaceId: "ws_acme" },
      facts: FACTS,
      memories: [],
      snapshot: null,
      audit: AUDIT_TRAIL,
    },
  };
}
