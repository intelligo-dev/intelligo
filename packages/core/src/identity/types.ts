import type {
  AuditActorKind,
  SynthesisTriggerReason,
  UserFact,
  UserFactCategory,
  UserFactExtractionMethod,
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

/** Who a fact's audit row names, and why. */
export type FactAuditBy = {
  actorKind?: AuditActorKind;
  actorId?: string;
  /** Recorded on the audit row. */
  reason?: string;
};

/**
 * A fact, as `recordFact` stores it. One fact per user, workspace,
 * category and key: recording the same key again replaces it.
 */
export type RecordFactInput = FactAuditBy & {
  category: UserFactCategory;
  /** The product's name for the fact, namespaced as it likes (`profile.city`). */
  key: string;
  /**
   * What the fact says. A string, or an object whose `label` is a line a
   * person can read: the privacy page shows that and nothing else of it.
   */
  value: unknown;
  /** 0 to 1. */
  confidence: number;
  /** Default 5. */
  importance?: number;
  /**
   * How the fact entered the system. With `lastConfirmedAt` it is the
   * fact's provenance: `llm_extraction` unconfirmed is what a model
   * read, confirmed is what the person agreed to, and
   * `explicit_user_input` is what they wrote.
   */
  extractionMethod: UserFactExtractionMethod;
  sourceProduct?: string | null;
  sourceSessionId?: string | null;
  sourceMessageId?: string | null;
  expiresAt?: Date | null;
};

/** The fact as stored, and whether this call wrote it. */
export type RecordFactResult = { fact: UserFact; written: boolean };

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
