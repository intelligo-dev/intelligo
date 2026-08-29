/**
 * One-time migration: conversations.metadata.assessmentState → user_facts.
 *
 * Phase F backfill. Reads every conversation row whose metadata
 * carries the legacy support assessment state and turns each
 * `phaseData.{interests, skills, goals, constraints, education}`
 * entry into the corresponding user_facts row. Idempotent — checks
 * for existing facts under the same (workspace, category, key)
 * before writing, so reruns and partial runs are safe.
 *
 *   pnpm --filter @intelligo/core tsx scripts/migrate-assessment-state-to-facts.ts [--dry-run]
 *
 * After this script ships, the chat handler can stop reading
 * assessment state out of conversations.metadata for personalization
 * and use the synthesized profile snapshot instead.
 */

import "dotenv/config";
import { db } from "../src/db";
import { conversations, userFacts } from "../src/db/schema";
import type { ConversationMetadata } from "../src/db/schema";
import { and, eq } from "drizzle-orm";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
}

function slugifyKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

type FactCategory = "interest" | "skill" | "goal" | "constraint" | "background";

type PendingFact = {
  userId: string;
  workspaceId: string;
  category: FactCategory;
  key: string;
  value: unknown;
  confidence: number;
  importance: number;
  sourceSessionId: string;
};

async function upsertOne(
  fact: PendingFact,
  dryRun: boolean
): Promise<"created" | "skipped" | "would-create"> {
  const existing = await db
    .select()
    .from(userFacts)
    .where(
      and(
        eq(userFacts.workspaceId, fact.workspaceId),
        eq(userFacts.category, fact.category),
        eq(userFacts.key, fact.key)
      )
    )
    .limit(1);

  if (existing.length > 0) return "skipped";
  if (dryRun) return "would-create";

  await db.insert(userFacts).values({
    id: crypto.randomUUID(),
    userId: fact.userId,
    workspaceId: fact.workspaceId,
    category: fact.category,
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence,
    importance: fact.importance,
    sourceProduct: "support",
    sourceSessionId: fact.sourceSessionId,
    extractionMethod: "llm_extraction",
    createdAt: new Date(),
    lastConfirmedAt: new Date(),
  });

  return "created";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[migrate-assessment-state-to-facts] starting${dryRun ? " (dry run)" : ""}`
  );

  const rows = await db.select().from(conversations);
  console.log(
    `[migrate-assessment-state-to-facts] scanning ${rows.length} conversations`
  );

  let created = 0;
  let skipped = 0;
  let wouldCreate = 0;
  let conversationsWithState = 0;

  for (const conv of rows) {
    const metadata = conv.metadata as ConversationMetadata | null;
    const state = metadata?.assessmentState;
    if (!state || !state.phaseData) continue;
    conversationsWithState++;

    const pending: PendingFact[] = [];
    const phase = state.phaseData;

    for (const item of asStringArray(phase.interests)) {
      pending.push({
        userId: conv.userId,
        workspaceId: conv.workspaceId,
        category: "interest",
        key: `interest_${slugifyKey(item)}`,
        value: { label: item },
        confidence: 0.8,
        importance: 6,
        sourceSessionId: conv.id,
      });
    }
    for (const item of asStringArray(phase.skills)) {
      pending.push({
        userId: conv.userId,
        workspaceId: conv.workspaceId,
        category: "skill",
        key: `skill_${slugifyKey(item)}`,
        value: { label: item },
        confidence: 0.75,
        importance: 6,
        sourceSessionId: conv.id,
      });
    }
    for (const item of asStringArray(phase.goals)) {
      pending.push({
        userId: conv.userId,
        workspaceId: conv.workspaceId,
        category: "goal",
        key: `goal_${slugifyKey(item)}`,
        value: { label: item },
        confidence: 0.85,
        importance: 8,
        sourceSessionId: conv.id,
      });
    }
    for (const item of asStringArray(phase.constraints)) {
      pending.push({
        userId: conv.userId,
        workspaceId: conv.workspaceId,
        category: "constraint",
        key: `constraint_${slugifyKey(item)}`,
        value: { label: item },
        confidence: 0.85,
        importance: 7,
        sourceSessionId: conv.id,
      });
    }
    if (
      typeof phase.education === "string" &&
      phase.education.trim().length > 0
    ) {
      pending.push({
        userId: conv.userId,
        workspaceId: conv.workspaceId,
        category: "background",
        key: "education",
        value: { summary: phase.education },
        confidence: 0.9,
        importance: 7,
        sourceSessionId: conv.id,
      });
    }

    for (const fact of pending) {
      const result = await upsertOne(fact, dryRun);
      if (result === "created") created++;
      else if (result === "skipped") skipped++;
      else wouldCreate++;
    }
  }

  console.log(
    `[migrate-assessment-state-to-facts] done — conversations=${conversationsWithState} created=${created} skipped=${skipped} wouldCreate=${wouldCreate}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-assessment-state-to-facts] failed", err);
  process.exit(1);
});
