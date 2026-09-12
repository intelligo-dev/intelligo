/**
 * @intelligo-dev/cli — operational commands for an Intelligo application.
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

/**
 * Where the framework's chain lives. Exported because a consumer's own
 * operational scripts — baselining a push-provisioned database, a
 * one-off audit — otherwise hardcode
 * `node_modules/@intelligo-dev/core/src/db/migrations`, which is right
 * in an application and wrong in the framework repository, and which
 * silently stops being either if the package layout ever changes.
 */
export { resolveMigrationsDir, MIGRATION_LOCATIONS } from "./migrations-dir.js";
