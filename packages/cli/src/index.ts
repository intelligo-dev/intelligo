/**
 * @intelligo/cli — operational commands for an Intelligo application.
 *
 * Exported as functions as well as a binary so CI can call the checks
 * directly (see the migration-chain gate) without shelling out.
 */

export {
  runChecks,
  formatResults,
  exitCodeFor,
  type CheckResult,
  type DoctorOptions,
} from "./commands/doctor.js";

export {
  migrateCheck,
  hashMigration,
  formatMigrateCheck,
  migrateCheckExitCode,
  type MigrateCheckResult,
} from "./commands/migrate-check.js";

export {
  readMigrationChain,
  inspectMigrationChain,
  type MigrationChain,
  type ChainProblem,
} from "./migrations.js";
