import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { FEATURES, type FeatureTile } from "@/lib/features";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { BorderBeam } from "@/components/ui/border-beam";
import { BoundarySimulator } from "@/components/boundary-simulator";
import { CliOutput } from "@/components/elements/cli-output";

/* ---------- shared: cycle only while visible ---------- */
function useCycle(length: number, ms: number, ref: React.RefObject<HTMLElement | null>) {
  const [i, setI] = useState(0);
  const [on, setOn] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setOn(!!e?.isIntersecting), { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    if (!on || reduce) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % length), ms);
    return () => window.clearInterval(t);
  }, [on, reduce, length, ms]);
  return i;
}

const Row = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("flex items-center gap-2 border-t border-line py-1.5 text-[0.78rem] first:border-t-0", className)}>{children}</div>
);
const Tag = ({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "amber" | "settle" | "fail" }) => (
  <span
    className={cn(
      "mono rounded-full border px-1.5 py-px text-[0.62rem] leading-tight",
      tone === "amber" && "border-amber text-amber",
      tone === "settle" && "border-settle text-settle",
      tone === "fail" && "border-fail text-fail",
      tone === "ink" && "border-line text-ink-faint"
    )}
  >
    {children}
  </span>
);

/* ---------- sims ---------- */

function IdentitySim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(4, 1800, ref);
  const ws = ["Acme Research", "Beta Labs"][Math.floor(i / 2) % 2];
  const inv = [
    ["sam@acme.io", "invited", "ink"],
    ["sam@acme.io", "accepted", "settle"],
    ["sam@acme.io", "member → admin", "amber"],
    ["sam@acme.io", "removed", "fail"],
  ][i]!;
  return (
    <div ref={ref}>
      <Row>
        <span className="inline-block size-1.5 bg-amber" />
        <AnimatePresence mode="wait">
          <motion.span key={ws} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} className="text-ink">
            {ws}
          </motion.span>
        </AnimatePresence>
        <span className="mono ml-auto text-ink-faint">▾ switch</span>
      </Row>
      {[["you", "owner"], ["maria", "admin"], ["li", "member"]].map(([n, r]) => (
        <Row key={n}>
          <span className="size-3 rounded-full bg-line-strong" />
          <span className="text-ink-dim">{n}</span>
          <span className="ml-auto"><Tag tone={r === "owner" ? "amber" : "ink"}>{r}</Tag></span>
        </Row>
      ))}
      <Row>
        <span className="text-ink-dim">{inv[0]}</span>
        <span className="ml-auto">
          <AnimatePresence mode="wait">
            <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Tag tone={inv[2] as "ink"}>{inv[1]}</Tag>
            </motion.span>
          </AnimatePresence>
        </span>
      </Row>
    </div>
  );
}

function CommerceSim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(3, 1600, ref);
  const held = [0, 120, 0][i]!;
  const label = ["idle", "hold 120", "charged 83"][i]!;
  const providers = ["Stripe", "QPay", "PIX", "UPI"];
  return (
    <div ref={ref}>
      <Row>
        <span className="text-ink">Pro</span>
        <Tag>plan is data</Tag>
        <span className="mono ml-auto text-ink-faint">3 / 5 seats</span>
      </Row>
      <div className="py-2">
        <div className="mono flex justify-between text-[0.66rem] text-ink-faint"><span>credits</span><span className={cn(held && "text-amber")}>{label}</span></div>
        <div className="mt-1 h-1.5 w-full bg-line">
          <motion.div className="h-full bg-amber" animate={{ width: `${held / 2}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">providers</span>
        <span className="ml-auto flex gap-1">
          {providers.map((p, n) => (
            <Tag key={p} tone={n === i % providers.length ? "amber" : "ink"}>{p}</Tag>
          ))}
        </span>
      </Row>
    </div>
  );
}

function PersistenceSim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(4, 1500, ref);
  const pct = [0, 35, 70, 100][i]!;
  return (
    <div ref={ref}>
      {[["Q3 summary", "v3", "2h"], ["Pricing audit", "v1", "1d"]].map(([n, v, t]) => (
        <Row key={n}>
          <span className="text-ink-dim">{n}</span>
          <Tag>{v}</Tag>
          <span className="mono ml-auto text-ink-faint">{t}</span>
        </Row>
      ))}
      <div className="py-2">
        <div className="mono flex justify-between text-[0.66rem] text-ink-faint">
          <span>export my data</span>
          <span className={cn(pct === 100 && "text-settle")}>{pct === 100 ? "ready" : `${pct}%`}</span>
        </div>
        <div className="mt-1 h-1.5 w-full bg-line">
          <motion.div className="h-full bg-settle" animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">memory audit</span>
        <span className="ml-auto"><Tag tone="fail">delete fact</Tag></span>
      </Row>
    </div>
  );
}

function OperationsSim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(4, 1300, ref);
  const states = ["queued", "running", "retry 2/3", "done"] as const;
  const tone = ["ink", "amber", "fail", "settle"] as const;
  return (
    <div ref={ref}>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">jobs</span>
        <span className="text-ink-dim">send-weekly-digest</span>
        <span className="ml-auto">
          <AnimatePresence mode="wait">
            <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Tag tone={tone[i]}>{states[i]}</Tag>
            </motion.span>
          </AnimatePresence>
        </span>
      </Row>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">audit</span>
        <span className="mono text-[0.72rem] text-ink-dim">execution.settled · acme</span>
      </Row>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">audit</span>
        <span className="mono text-[0.72rem] text-ink-dim">member.role_changed · li → admin</span>
      </Row>
      <Row>
        <span className="mono text-[0.7rem] text-ink-faint">admin</span>
        <span className="ml-auto"><Tag tone="fail">impersonating — audited</Tag></span>
      </Row>
    </div>
  );
}

const CHIPS = ["auth-login", "auth-signup", "onboarding", "app-shell", "dashboard", "team-settings", "pricing", "checkout", "billing-settings", "usage", "notifications", "chat", "artifacts", "privacy-settings"];
function PagesSim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(CHIPS.length, 700, ref);
  return (
    <div ref={ref}>
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c, n) => (
          <span key={c} className={cn("mono border px-1.5 py-px text-[0.64rem] transition-colors", n === i ? "border-amber text-amber" : "border-line text-ink-faint")}>
            {c}
          </span>
        ))}
        <span className="mono px-1 text-[0.64rem] text-ink-faint">+11</span>
      </div>
      <div className="mono mt-2 truncate border-t border-line pt-2 text-[0.68rem] text-ink-dim">
        $ shadcn add <span className="text-ink">@intelligo-dev/{CHIPS[i]}</span>
      </div>
    </div>
  );
}

function I18nSim() {
  const ref = useRef<HTMLDivElement>(null);
  const i = useCycle(2, 2000, ref);
  const t = i === 0
    ? { l: "en", h: "Invite a teammate", b: "They'll get an email with a link that expires in 7 days.", btn: "Send invitation" }
    : { l: "mn", h: "Багийн гишүүн урих", b: "Тэдэнд 7 хоногийн дотор хүчинтэй холбоос бүхий имэйл очно.", btn: "Урилга илгээх" };
  return (
    <div ref={ref}>
      <div className="mono mb-2 flex gap-1 text-[0.66rem]">
        {["en", "mn"].map((l, n) => (
          <span key={l} className={cn("border px-1.5 py-px", n === i ? "border-amber text-amber" : "border-line text-ink-faint")}>{l}</span>
        ))}
        <span className="ml-auto text-ink-faint">messages/{t.l}/team-settings.json</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="border border-line p-2.5">
          <div className="text-[0.82rem] font-semibold text-ink">{t.h}</div>
          <div className="mt-0.5 text-[0.74rem] text-ink-dim">{t.b}</div>
          <span className="mono mt-2 inline-block bg-ink px-2 py-1 text-[0.66rem] text-paper">{t.btn}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CliSim() {
  return (
    <CliOutput
      showControls={false}
      className="text-[0.7rem] [&_*]:text-[0.7rem]"
      output={[
        "intelligo doctor",
        "\x1b[32m✓\x1b[0m lib/intelligo.ts — unchanged",
        "\x1b[33m●\x1b[0m lib/nav-config.ts — customized, will not clobber",
        "\x1b[32m✓\x1b[0m migrations — up to date",
      ]}
    />
  );
}

function Sim({ kind }: { kind: FeatureTile["sim"] }) {
  switch (kind) {
    case "boundary": return <BoundarySimulator />;
    case "identity": return <IdentitySim />;
    case "commerce": return <CommerceSim />;
    case "persistence": return <PersistenceSim />;
    case "operations": return <OperationsSim />;
    case "pages": return <PagesSim />;
    case "i18n": return <I18nSim />;
    case "cli": return <CliSim />;
  }
}

/* ---------- the bento ---------- */

export function FeatureBento() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12">
      {FEATURES.map((f) => (
        <SpotlightCard
          key={f.id}
          borderRadius={8}
          spotlightColor="color-mix(in srgb, var(--foreground) 10%, transparent)"
          borderColor="var(--border)"
          className={cn("relative !bg-paper-raised !bg-none", f.span, f.id === "boundary" && "md:col-span-2")}
        >
          {f.id === "boundary" && (
            <BorderBeam size={220} duration={9} borderWidth={1} colorFrom="var(--foreground)" colorTo="transparent" />
          )}
          <a href={f.anchor} className="group block h-full p-5 no-underline">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[1.02rem] font-semibold text-ink">{f.title}</h3>
              <span className="mono text-[0.68rem] text-ink-faint transition-colors group-hover:text-amber">→</span>
            </div>
            <p className="mt-1 text-[0.88rem] text-ink-dim">{f.lead}</p>
          </a>
          <div className="px-5 pb-5">
            <Sim kind={f.sim} />
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}
