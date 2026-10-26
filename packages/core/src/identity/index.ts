/**
 * Privacy-facing reads and mutations over the user identity graph: fact
 * listing, recording, confirmation and deletion, the profile snapshot's
 * write, full-identity export, and the memory-audit trail.
 */

export {
  listFacts,
  recordFact,
  confirmFact,
  deleteFact,
  saveProfileSnapshot,
  exportIdentity,
  getAuditTrail,
  eraseUserFromMemoryAudit,
} from "./service";

export {
  IdentityServiceError,
  isIdentityServiceError,
  type IdentityServiceErrorCode,
} from "./errors";

export type {
  FactAuditBy,
  IdentityActor,
  IdentityExport,
  RecordFactInput,
  RecordFactResult,
  SaveProfileSnapshotInput,
  UserFact,
  UserMemory,
  UserProfileSnapshot,
  UserMemoryAuditRow,
} from "./types";
