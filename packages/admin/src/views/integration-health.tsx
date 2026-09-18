import type { HealthStatus, IntegrationHealth } from "../health";

/**
 * Integration health, ordered worst-first. Each row carries the sentence
 * that says what to do and the numbers behind it.
 */

export type IntegrationHealthViewProps = {
  integrations: IntegrationHealth[];
};

const SEVERITY: Record<HealthStatus, number> = {
  down: 0,
  degraded: 1,
  unconfigured: 2,
  ok: 3,
};

const SYMBOL: Record<HealthStatus, string> = {
  down: "✕",
  degraded: "!",
  unconfigured: "–",
  ok: "✓",
};

export function IntegrationHealthView({
  integrations,
}: IntegrationHealthViewProps) {
  const ordered = [...integrations].sort(
    (a, b) => SEVERITY[a.status] - SEVERITY[b.status]
  );
  const broken = ordered.filter((i) => i.status === "down").length;

  return (
    <section>
      <h2>Integrations{broken > 0 ? ` — ${broken} down` : ""}</h2>
      <ul>
        {ordered.map((i) => (
          <li key={i.key} data-status={i.status}>
            <strong>
              {SYMBOL[i.status]} {i.label}
            </strong>{" "}
            · {i.status}
            <div>{i.detail}</div>
            {i.metrics ? (
              <div>
                {Object.entries(i.metrics).map(([k, v]) => (
                  <code key={k}>
                    {k}={String(v)}{" "}
                  </code>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
