/**
 * @intelligo-dev/admin — the Intelligo-owned operational console.
 *
 * Framework-owned because it manages Intelligo's concepts, not any
 * product's customer experience. It is mounted by the
 * consumer application under a reserved namespace and must never
 * become the host for a product dashboard.
 *
 * Exports are headless: query functions and an authorization gate.
 * Screens are the consumer's, generated from templates like any other
 * page, so a product can brand its own admin without forking this
 * package.
 */

export {
  requireAdmin,
  requireAdminOrRefuse,
  type AdminActor,
} from "./authorization";

export {
  getPlatformOverview,
  listUsers,
  listWorkspaces,
  listUnsettledExecutions,
  listWorkspaceExecutions,
  queryAuditEvents,
  listFailedJobs,
  type PlatformOverview,
  type UserRow,
  type WorkspaceRow,
} from "./queries";

export {
  startImpersonation,
  stopImpersonation,
  type ImpersonationResult,
} from "./impersonation";

export {
  getIntegrationHealth,
  registerIntegrationProbe,
  clearIntegrationProbes,
  type HealthStatus,
  type IntegrationHealth,
  type IntegrationProbe,
} from "./health";
