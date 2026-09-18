/**
 * Privacy-facing reads and mutations over the user identity graph: fact
 * listing and deletion, full-identity export, and the memory-audit trail.
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
