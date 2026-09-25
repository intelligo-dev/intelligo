/**
 * Why `begin` could not start an execution. A refusal by entitlement is
 * not an error (`run.allowed` is false); this is a request the lifecycle
 * cannot record at all.
 */

export type ExecutionErrorCode = "request_id_taken";

export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;

  constructor(code: ExecutionErrorCode, message: string) {
    super(message);
    this.name = "ExecutionError";
    this.code = code;
  }
}

/** Postgres' unique violation, however the driver wrapped it. */
export function isUniqueViolation(error: unknown): boolean {
  for (
    let e = error;
    e && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** A `requestId` names one attempt, across the deployment. */
export function requestIdTaken(requestId: string): ExecutionError {
  return new ExecutionError(
    "request_id_taken",
    `Request id ${requestId} already names an execution — an earlier attempt, refused ones included. Begin a retry with a new id.`
  );
}
