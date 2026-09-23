/**
 * The operational console over the framework's own concepts (workspaces,
 * credits, executions, audit, jobs), never a product dashboard. Exports are
 * headless: queries, health checks, impersonation and the authorization gate.
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
  getProviderCostTotal,
  getRevenue,
  getUsageByModel,
  getUsageByUser,
  getPlanDistribution,
  listUsageRecords,
  type UsageByModelRow,
  type UsageByUserRow,
  type PlanDistributionRow,
  type UsageRecordRow,
} from "./usage";

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
