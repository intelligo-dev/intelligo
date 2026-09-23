import type {
  AuditActorKind,
  SynthesisTriggerReason,
  UserFact,
  UserMemory,
  UserProfileSnapshot,
  UserMemoryAuditRow,
} from "../db/schema";

export type { UserFact, UserMemory, UserProfileSnapshot, UserMemoryAuditRow };

/** Resolved actor identity — every query is scoped to this pair. */
export type IdentityActor = {
  workspaceId: string;
  userId: string;
};

/**
 * Full identity dump for a GDPR-style "download my data" flow: every
 * fact and memory the actor owns, their latest synthesized profile
 * snapshot (if one exists), and their complete memory-audit trail.
 */
export type IdentityExport = {
  exportedAt: string;
  user: { id: string; workspaceId: string };
  facts: UserFact[];
  memories: UserMemory[];
  snapshot: UserProfileSnapshot | null;
  audit: UserMemoryAuditRow[];
};

/**
 * A synthesized profile, as `saveProfileSnapshot` stores it. The actor
 * supplies the tenancy; the version is the store's.
 */
export type SaveProfileSnapshotInput = {
  /** The summary a prompt hydrates from, in the product's primary language. */
  summary: string;
  summaryEn?: string | null;
  summaryMn?: string | null;
  /** The structured digest the summary was written from. */
  factsDigest: unknown;
  activeGoals?: unknown;
  personalitySignals?: unknown;
  relationshipNotes?: unknown;
  /** The model that wrote it, or a label for a deterministic synthesis. */
  synthesizedByModel?: string | null;
  /** Default: now. */
  synthesizedAt?: Date;
  /** When a scheduled re-synthesis may next pick this user up. */
  nextSynthesisAt?: Date | null;
  triggerReason?: SynthesisTriggerReason | null;
  /** Who the audit row names. Default `"system_job"`. */
  actorKind?: AuditActorKind;
  actorId?: string;
  /** Recorded on the audit row. */
  reason?: string;
};
