import type { AuditEvent } from "@intelligo/audit";
import type { Job } from "@intelligo/jobs";

/**
 * Failed jobs and recent audit events.
 *
 * Separate from the platform overview because they answer a different
 * question: the overview says whether the system is healthy, this says
 * what happened and who did it. A support engineer opening a ticket
 * needs the second one.
 */

export type OperationsViewProps = {
  failedJobs: Job[];
  auditEvents: AuditEvent[];
};

export function OperationsView({
  failedJobs,
  auditEvents,
}: OperationsViewProps) {
  return (
    <div>
      <section>
        <h2>Failed jobs ({failedJobs.length})</h2>
        {failedJobs.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul>
            {failedJobs.map((j) => (
              <li key={j.id}>
                <strong>{j.kind}</strong> · {j.attempts}/{j.maxAttempts}{" "}
                attempts
                {j.lastError ? (
                  <>
                    {" "}
                    · <code>{j.lastError}</code>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Recent activity</h2>
        {auditEvents.length === 0 ? (
          <p>Nothing recorded.</p>
        ) : (
          <ul>
            {auditEvents.map((e) => (
              <li key={e.id}>
                <code>{e.action}</code>
                {e.outcome === "failed" ? " (failed)" : ""} ·{" "}
                {/* actorKind distinguishes a customer's own action from
                    a support engineer acting on their behalf — the
                    distinction the whole audit trail exists for. */}
                {e.actorKind}
                {e.resourceId
                  ? ` · ${e.resourceKind}:${e.resourceId}`
                  : ""} · {e.createdAt.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
