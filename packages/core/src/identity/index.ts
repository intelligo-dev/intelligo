/**
 * Identity Module (ADR-0008/ADR-0009 precedent)
 *
 * Privacy-facing reads and mutations over the user identity graph:
 * fact listing/deletion, full-identity export, and the memory-audit
 * trail. See ./service.ts for the full module doc comment, including
 * what stayed agents-side (profile re-synthesis) and why the
 * memory-audit writer lives in this module rather than in
 * `@intelligo/audit`.
 *
 * Use via subpath import: @intelligo/core/identity
 */

export {
  listFacts,
  deleteFact,
  exportIdentity,
  getAuditTrail,
} from "./service";

export {
  IdentityServiceError,
  isIdentityServiceError,
  type IdentityServiceErrorCode,
} from "./errors";

export type {
  IdentityActor,
  IdentityExport,
  UserFact,
  UserMemory,
  UserProfileSnapshot,
  UserMemoryAuditRow,
} from "./types";
