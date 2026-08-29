/**
 * Shared types for the identity service.
 */

import type {
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
