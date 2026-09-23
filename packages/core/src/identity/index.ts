/**
 * Privacy-facing reads and mutations over the user identity graph: fact
 * listing and deletion, the profile snapshot's write, full-identity
 * export, and the memory-audit trail.
 */

export {
  listFacts,
  deleteFact,
  saveProfileSnapshot,
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
  SaveProfileSnapshotInput,
  UserFact,
  UserMemory,
  UserProfileSnapshot,
  UserMemoryAuditRow,
} from "./types";
