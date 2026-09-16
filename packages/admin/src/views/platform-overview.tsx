import { formatMoney } from "@intelligo-dev/core/money";

import type { PlatformOverview, WorkspaceRow } from "../queries";

/**
 * The platform overview screen.
 *
 * Shipped by the package rather than generated into the consumer,
 * unlike product pages: ADR-0002 keeps the *customer-facing* surface
 * with the consumer, but the admin console is framework-owned
 * precisely so every deployment shows the same operational truth. A
 * product that forked this screen could quietly stop showing itself
 * unsettled executions.
 *
 * Presentation is intentionally minimal and unstyled — the consumer
 * wraps it in their own chrome, and the host app's design tokens apply if
 * they are in scope.
 */

export type UnsettledExecution = {
  id: string;
  capability: string;
  status: string;
  requestId: string;
};

export type PlatformOverviewViewProps = {
  overview: PlatformOverview;
  workspaces: WorkspaceRow[];
  unsettled: UnsettledExecution[];
};

export function PlatformOverviewView({
  overview,
  workspaces,
  unsettled,
}: PlatformOverviewViewProps) {
  return (
    <div>
      <section>
        <h2>Last 24 hours</h2>
        <ul>
          <li>
            {overview.workspaces} workspaces · {overview.users} users
          </li>
          <li>{overview.executions24h} executions</li>
          <li>
            {overview.failed24h} failed ·{" "}
            {/* Refusals sit next to failures on purpose: a spike in
                them is a pricing or provisioning problem that looks
                like nothing at all in an error dashboard. */}
            {overview.refused24h} refused
          </li>
          <li>
            {/* One entry per currency: the console is above any single
                deployment, and adding two currencies together would be
                a number that is true of neither. */}
            {overview.charged24h.length === 0
              ? "nothing"
              : overview.charged24h
                  .map((amount) => formatMoney(amount, "en-US"))
                  .join(" · ")}{" "}
            charged
          </li>
        </ul>
      </section>

      {unsettled.length > 0 && (
        <section>
          <h2>Unsettled executions ({unsettled.length})</h2>
          <p>
            Usage was consumed and never charged. Each of these is a stream that
            died between admission and settlement.
          </p>
          <ul>
            {unsettled.map((e) => (
              <li key={e.id}>
                {e.capability} · {e.status} · <code>{e.requestId}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Workspaces</h2>
        <ul>
          {workspaces.map((w) => (
            <li key={w.id}>
              {w.name} <code>{w.slug}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
