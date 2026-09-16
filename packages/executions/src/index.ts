/**
 * @intelligo-dev/executions — the SaaS execution boundary.
 *
 * Wraps a native AI run (Mastra, AI SDK, anything) with entitlement,
 * credit hold, usage/cost recording, and audit — and records nothing
 * about agents, tools, or messages (ADR-0003).
 *
 * The composition root builds one instance with the ports bound:
 *
 *   export const executions = createExecutions({
 *     checkEntitlement: billingEntitlementPort,
 *     settleUsage: billingSettlementPort,
 *   });
 */

export { createExecutions } from "./lifecycle";
export type {
  Executions,
  ExecutionStatus,
  ExecutionRun,
  ReconcileResult,
  BeginExecutionInput,
  CompleteExecutionInput,
} from "./lifecycle";

export type {
  ExecutionPorts,
  EntitlementDecision,
  EntitlementRequest,
  UsageSettlement,
  SettlementResult,
  SettlementQuery,
} from "./ports";

export {
  listExecutions,
  getExecutionByRequestId,
  summarizeExecutions,
  findStaleExecutions,
  summarizeExecutionsByDay,
} from "./queries";
export type { ListExecutionsOptions } from "./queries";

export { executions } from "./db/schema";
export type { Execution, InsertExecution } from "./db/schema";

/**
 * Model registry and cost accounting. Also reachable as
 * `@intelligo-dev/executions/pricing`, which is the import to use from
 * anything that reaches a browser — this barrel pulls in the database.
 */
export {
  DEFAULT_MODELS,
  UnknownModelError,
  registerModel,
  registerModels,
  getModelPricing,
  isModelRegistered,
  listModels,
  registeredModelIds,
  clearModels,
  DEFAULT_MARGIN_BP,
  PROVIDER_CURRENCY,
  providerCost,
  chargeFor,
  estimateWorstCaseCharge,
} from "./pricing";
export type {
  ModelId,
  ModelPricing,
  ModelCapabilities,
  BillingRate,
} from "./pricing";
