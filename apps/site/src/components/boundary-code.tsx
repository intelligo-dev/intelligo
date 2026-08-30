import { useState } from "react";
import { cn } from "@/lib/utils";
import { TextMorph } from "@/components/ui/text-morph";

/**
 * The boundary, as code — the same shape as packages/executions/src/lifecycle.ts:
 * begin() → complete() / fail(). The bracket never changes; only the
 * middle line morphs between frameworks. Hovering a lifecycle row
 * highlights the line of code it describes, and vice versa.
 */
const TABS = [
  { id: "mastra", label: "Mastra", line: "const result = await yourAgent.generate(messages);" },
  { id: "ai-sdk", label: "Vercel AI SDK", line: "const result = await generateText({ model, messages });" },
  { id: "any", label: "anything", line: "const result = await yourFramework.run(input);" },
] as const;

type Row = "admit" | "run" | "settle" | "fail";

const LIFECYCLE: { id: Row; label: string; strong: string; rest: string }[] = [
  { id: "admit", label: "ADMIT", strong: "Entitlements and reservation.", rest: " Plan checked through a port, worst-case cost held, execution row written." },
  { id: "run", label: "RUN", strong: "Your agent, native.", rest: " No wrapper, no new agent API — the handle knows nothing about messages or tools." },
  { id: "settle", label: "SETTLE", strong: "Usage and credits.", rest: " Tokens and cost recorded, credits charged. Idempotent — a duplicate complete() cannot double-bill." },
  { id: "fail", label: "FAIL", strong: "Release and audit.", rest: " Reservation released, error recorded, audit event written." },
];

export function BoundaryCode() {
  const [hot, setHot] = useState<Row | null>(null);
  const on = (r: Row) => hot === r;
  const lineCls = (r: Row) =>
    cn("block -mx-2 px-2 transition-colors", on(r) && "bg-amber-soft text-ink", hot && !on(r) && "opacity-50");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
      <div>
        <div className="mono flex flex-wrap items-center gap-1 text-[0.74rem]" aria-label="AI frameworks">
          {TABS.map((t) => (
            <span key={t.id} className="border border-line-strong px-2.5 py-1 text-ink-dim">
              {t.label}
            </span>
          ))}
          <span className="ml-auto text-ink-faint">only the middle line changes</span>
        </div>

        <pre className="code mt-3 overflow-x-auto whitespace-pre text-[0.82rem] leading-[1.7]">
          <span className={lineCls("admit")} onMouseEnter={() => setHot("admit")} onMouseLeave={() => setHot(null)}>
            <span className="text-amber">const</span> run = <span className="text-amber">await</span> executions.<span className="text-settle">begin</span>({"{"} workspaceId, userId, capability, model {"}"});
          </span>
          <span className={lineCls("admit")} onMouseEnter={() => setHot("admit")} onMouseLeave={() => setHot(null)}>
            <span className="text-amber">if</span> (!run.allowed) <span className="text-amber">return</span> refuse(run.reason);
          </span>
          {"\n"}
          <span className={cn(lineCls("run"), "text-ink-faint italic")} onMouseEnter={() => setHot("run")} onMouseLeave={() => setHot(null)}>
            {"// your framework, unmodified"}
          </span>
          <span className={lineCls("run")} onMouseEnter={() => setHot("run")} onMouseLeave={() => setHot(null)}>
            <TextMorph words={TABS.map((t) => t.line)} interval={3200} morphDuration={720} className="inline" />
          </span>
          {"\n"}
          <span className={lineCls("settle")} onMouseEnter={() => setHot("settle")} onMouseLeave={() => setHot(null)}>
            <span className="text-amber">await</span> run.<span className="text-settle">complete</span>({"{"} usage: result.usage {"}"});
          </span>
          <span className={lineCls("fail")} onMouseEnter={() => setHot("fail")} onMouseLeave={() => setHot(null)}>
            <span className="text-ink-faint">{"// or, in catch: "}</span><span className="text-amber">await</span> run.<span className="text-fail">fail</span>({"{"} error {"}"});
          </span>
        </pre>
      </div>

      <div>
        <ol className="border-t border-line">
          {LIFECYCLE.map((l) => (
            <li
              key={l.id}
              onMouseEnter={() => setHot(l.id)}
              onMouseLeave={() => setHot(null)}
              className={cn(
                "-mx-2 flex gap-4 border-b border-line px-2 py-3.5 transition-colors",
                on(l.id) && "bg-amber-soft/60",
                hot && !on(l.id) && "opacity-55"
              )}
            >
              <span className={cn("mono w-[4.6rem] shrink-0 pt-0.5 text-[0.72rem] tracking-wide", l.id === "run" ? "text-amber" : "text-ink-faint")}>{l.label}</span>
              <p className="text-[0.93rem] text-ink-dim">
                <strong className="font-semibold text-ink">{l.strong}</strong>
                {l.rest}
              </p>
            </li>
          ))}
        </ol>
        <p className="mono mt-4 text-[0.74rem] leading-relaxed text-ink-faint">
          Unrecorded usage is never reported as success — a settlement that dies mid-way stays <span className="text-ink-dim">settling</span> and is swept and reported.
        </p>
      </div>
    </div>
  );
}
