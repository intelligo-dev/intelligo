import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { REGISTRY_ITEMS, type RegistryGroup, type RegistryItem } from "@/lib/registry-items";

/**
 * 25 page families from registry.json. The preview is a themed HTML
 * sketch of each item, not a screenshot, and the locale toggle changes
 * only the strings — the component stays the same (ADR-0010).
 */
type Locale = "en" | "mn";

const T: Record<Locale, Record<string, string>> = {
  en: {
    signin: "Sign in", email: "Email", password: "Password", continue: "Continue", or: "or",
    verify: "Check your inbox", verifyBody: "We sent a link to", resend: "Resend",
    reset: "Reset your password", newpw: "New password", save: "Save",
    onboarding: "Set up your workspace", name: "Workspace name", next: "Next", back: "Back",
    invite: "You've been invited", accept: "Accept", decline: "Decline",
    dashboard: "Good morning", ask: "Ask anything…", recent: "Recent",
    notif: "Notifications", markread: "Mark all read",
    lang: "Language", trial: "Trial: 9 days and 640 credits left", upgrade: "Upgrade",
    error: "Something went wrong", retry: "Try again",
    settings: "Settings", general: "General", team: "Team", profile: "Profile", privacy: "Privacy", billing: "Billing",
    wsname: "Workspace name", danger: "Delete workspace",
    members: "Members", inviteBtn: "Invite", role: "Role",
    display: "Display name", deleteacc: "Delete account",
    export: "Export my data", memory: "Memory audit", deleteFact: "Delete",
    plans: "Plans", monthly: "Monthly", yearly: "Yearly", choose: "Choose",
    success: "Payment confirmed", receipt: "Your plan is active.",
    balance: "Credit balance", buy: "Buy credits", portal: "Billing portal",
    usage: "Usage", runs: "runs", tokens: "tokens", cost: "cost",
    gated: "Pro feature", gatedBody: "Upgrade to unlock exports.",
    scan: "Scan to pay", waiting: "Waiting for confirmation…",
    chat: "New conversation", history: "History", send: "Send",
    artifacts: "Artifacts", version: "version", copy: "Copy",
  },
  mn: {
    signin: "Нэвтрэх", email: "Имэйл", password: "Нууц үг", continue: "Үргэлжлүүлэх", or: "эсвэл",
    verify: "Имэйлээ шалгана уу", verifyBody: "Холбоос илгээлээ:", resend: "Дахин илгээх",
    reset: "Нууц үг сэргээх", newpw: "Шинэ нууц үг", save: "Хадгалах",
    onboarding: "Ажлын талбараа тохируулах", name: "Ажлын талбарын нэр", next: "Дараах", back: "Буцах",
    invite: "Таныг урьсан байна", accept: "Зөвшөөрөх", decline: "Татгалзах",
    dashboard: "Өглөөний мэнд", ask: "Юу ч асуугаарай…", recent: "Сүүлийн",
    notif: "Мэдэгдэл", markread: "Бүгдийг уншсан болгох",
    lang: "Хэл", trial: "Туршилт: 9 хоног, 640 кредит үлдлээ", upgrade: "Сайжруулах",
    error: "Алдаа гарлаа", retry: "Дахин оролдох",
    settings: "Тохиргоо", general: "Ерөнхий", team: "Баг", profile: "Профайл", privacy: "Нууцлал", billing: "Төлбөр",
    wsname: "Ажлын талбарын нэр", danger: "Ажлын талбар устгах",
    members: "Гишүүд", inviteBtn: "Урих", role: "Үүрэг",
    display: "Нэр", deleteacc: "Бүртгэл устгах",
    export: "Өгөгдлөө татах", memory: "Санах ойн аудит", deleteFact: "Устгах",
    plans: "Багцууд", monthly: "Сараар", yearly: "Жилээр", choose: "Сонгох",
    success: "Төлбөр баталгаажлаа", receipt: "Таны багц идэвхжлээ.",
    balance: "Кредитийн үлдэгдэл", buy: "Кредит авах", portal: "Төлбөрийн портал",
    usage: "Хэрэглээ", runs: "ажиллагаа", tokens: "токен", cost: "зардал",
    gated: "Pro боломж", gatedBody: "Export нээхийн тулд сайжруулна уу.",
    scan: "Уншуулж төлөх", waiting: "Баталгаажуулалт хүлээж байна…",
    chat: "Шинэ яриа", history: "Түүх", send: "Илгээх",
    artifacts: "Артефакт", version: "хувилбар", copy: "Хуулах",
  },
};

const Btn = ({ children, primary }: { children: React.ReactNode; primary?: boolean }) => (
  <span className={cn("mono inline-block px-2 py-1 text-[0.66rem] leading-none", primary ? "bg-ink text-paper" : "border border-line-strong text-ink-dim")}>{children}</span>
);
const Input = ({ label }: { label: string }) => (
  <div>
    <div className="mono text-[0.62rem] text-ink-faint">{label}</div>
    <div className="mt-0.5 h-6 border border-line bg-paper" />
  </div>
);
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid h-full place-items-center bg-paper-sunken p-4">
    <div className="w-[min(100%,240px)] border border-line-strong bg-paper-raised p-4">
      <div className="mono mb-2 flex items-center gap-1.5 text-[0.7rem] font-semibold"><span className="size-1.5 bg-amber" /> intelligo</div>
      <div className="mb-2 text-[0.85rem] font-semibold text-ink">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  </div>
);
const Shell = ({ title, tabs, active, children, right }: { title: string; tabs?: string[]; active?: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="grid h-full grid-cols-[84px_1fr] bg-paper">
    <aside className="border-r border-line bg-paper-raised p-2">
      <div className="mono flex items-center gap-1 border border-line px-1.5 py-1 text-[0.62rem]"><span className="size-1.5 bg-amber" /> Acme ▾</div>
      <div className="mono mt-2 space-y-1 text-[0.62rem] text-ink-faint">
        {["dashboard", "chat", "artifacts", "usage", "settings"].map((n) => <div key={n}>{n}</div>)}
      </div>
    </aside>
    <div className="flex min-w-0 flex-col">
      <div className="flex h-7 items-center justify-between border-b border-line px-3">
        <span className="text-[0.72rem] font-semibold text-ink">{title}</span>
        {right}
      </div>
      {tabs && (
        <div className="mono flex gap-3 border-b border-line px-3 text-[0.62rem]">
          {tabs.map((t) => <span key={t} className={cn("py-1", t === active ? "border-b border-amber text-amber" : "text-ink-faint")}>{t}</span>)}
        </div>
      )}
      <div className="flex-1 p-3">{children}</div>
    </div>
  </div>
);
const Tag = ({ children, tone }: { children: React.ReactNode; tone?: "amber" | "settle" | "fail" }) => (
  <span className={cn("mono rounded-full border px-1.5 py-px text-[0.6rem]", tone === "amber" ? "border-amber text-amber" : tone === "settle" ? "border-settle text-settle" : tone === "fail" ? "border-fail text-fail" : "border-line text-ink-faint")}>{children}</span>
);

function Preview({ item, l }: { item: RegistryItem; l: Locale }) {
  const t = T[l]!;
  const settingsTabs = [t.general!, t.team!, t.profile!, t.privacy!, t.billing!];
  switch (item.name) {
    case "auth-login":
      return <Card title={t.signin!}><Input label={t.email!} /><Input label={t.password!} /><Btn primary>{t.continue}</Btn><div className="mono text-center text-[0.6rem] text-ink-faint">— {t.or} —</div><div className="grid grid-cols-2 gap-1"><Btn>Google</Btn><Btn>GitHub</Btn></div></Card>;
    case "auth-signup":
      return <Card title={t.continue!}><Input label={t.email!} /><Input label={t.password!} /><Btn primary>{t.continue}</Btn></Card>;
    case "auth-password-reset":
      return <Card title={t.reset!}><Input label={t.newpw!} /><Btn primary>{t.save}</Btn></Card>;
    case "auth-email-verification":
      return <Card title={t.verify!}><p className="text-[0.72rem] text-ink-dim">{t.verifyBody} you@company.com</p><div className="flex gap-2"><Tag tone="settle">✓</Tag><Btn>{t.resend}</Btn></div></Card>;
    case "onboarding":
      return <Card title={t.onboarding!}><div className="flex gap-1">{[1, 2, 3].map((i) => <span key={i} className={cn("h-1 flex-1", i < 3 ? "bg-amber" : "bg-line")} />)}</div><Input label={t.name!} /><div className="flex justify-between"><Btn>{t.back}</Btn><Btn primary>{t.next}</Btn></div></Card>;
    case "invitation-accept":
      return <Card title={t.invite!}><p className="text-[0.72rem] text-ink-dim">Acme Research · <Tag>admin</Tag></p><div className="flex gap-1"><Btn primary>{t.accept}</Btn><Btn>{t.decline}</Btn></div></Card>;
    case "app-shell":
      return <Shell title={t.dashboard!} right={<Tag>Free</Tag>}><div className="mono text-[0.64rem] text-ink-faint">sidebar · switcher · nav · user menu</div></Shell>;
    case "dashboard":
      return <Shell title={t.dashboard!}><div className="border border-line-strong p-2 text-[0.7rem] text-ink-faint">{t.ask}</div><div className="mono mt-2 text-[0.62rem] text-ink-faint">{t.recent}</div>{["Q3 summary", "Pricing audit"].map((c) => <div key={c} className="border-t border-line py-1 text-[0.68rem] text-ink">{c}</div>)}</Shell>;
    case "notifications":
      return <Shell title={t.notif!} right={<Btn>{t.markread}</Btn>}>{["maria accepted your invitation", "Payment received", "Export ready"].map((n, i) => <div key={n} className={cn("border-t border-line py-1.5 text-[0.7rem]", i === 0 ? "text-ink" : "text-ink-dim")}>{i === 0 && <span className="mr-1 inline-block size-1.5 rounded-full bg-amber" />}{n}</div>)}</Shell>;
    case "language-switcher":
      return <Shell title={t.settings!} right={<span className="mono border border-line px-1.5 py-px text-[0.62rem]">{t.lang}: {l === "en" ? "English" : "Монгол"} ▾</span>}><div className="mono text-[0.64rem] text-ink-faint">i18n/routing.ts → locales</div></Shell>;
    case "trial-banner":
      return <Shell title={t.dashboard!}><div className="-m-3 mb-2 flex items-center justify-between border-b border-amber bg-amber-soft px-3 py-1.5 text-[0.68rem] text-ink"><span>{t.trial}</span><Btn primary>{t.upgrade}</Btn></div></Shell>;
    case "route-error":
      return <Shell title={t.error!}><div className="grid h-full place-items-center"><div className="text-center"><div className="mono text-[1.4rem] text-fail">500</div><div className="text-[0.72rem] text-ink-dim">{t.error}</div><div className="mt-2"><Btn>{t.retry}</Btn></div></div></div></Shell>;
    case "settings-shell":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.general!}><div className="mono text-[0.64rem] text-ink-faint">lib/settings-nav.ts</div></Shell>;
    case "workspace-settings":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.general!}><Input label={t.wsname!} /><div className="mt-2"><Btn primary>{t.save}</Btn></div><div className="mt-3 border-t border-fail/40 pt-2"><Btn>{t.danger}</Btn></div></Shell>;
    case "team-settings":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.team!} right={<Btn primary>{t.inviteBtn}</Btn>}>{[["you", "owner"], ["maria", "admin"], ["li", "member"]].map(([n, r]) => <div key={n} className="flex items-center gap-2 border-t border-line py-1 text-[0.68rem]"><span className="size-3 rounded-full bg-line-strong" />{n}<span className="ml-auto"><Tag tone={r === "owner" ? "amber" : undefined}>{r}</Tag></span></div>)}</Shell>;
    case "profile-settings":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.profile!}><Input label={t.display!} /><div className="mt-2"><Btn primary>{t.save}</Btn></div><div className="mt-3 border-t border-fail/40 pt-2"><Btn>{t.deleteacc}</Btn></div></Shell>;
    case "privacy-settings":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.privacy!}><div className="flex items-center justify-between border border-line p-2 text-[0.7rem]"><span>{t.export}</span><Btn>↓</Btn></div><div className="mono mt-2 text-[0.62rem] text-ink-faint">{t.memory}</div>{["prefers concise answers", "works in fintech"].map((f) => <div key={f} className="flex justify-between border-t border-line py-1 text-[0.68rem] text-ink-dim">{f}<span className="text-fail">{t.deleteFact}</span></div>)}</Shell>;
    case "pricing":
      return <Shell title={t.plans!} right={<span className="mono text-[0.6rem] text-ink-faint">{t.monthly} · <span className="text-amber">{t.yearly}</span></span>}><div className="grid grid-cols-3 gap-1">{[["Free", "$0"], ["Pro", "$29"], ["Team", "$99"]].map(([n, p], i) => <div key={n} className={cn("border p-1.5", i === 1 ? "border-amber" : "border-line")}><div className="text-[0.66rem] font-semibold">{n}</div><div className="mono text-[0.85rem]">{p}</div><div className="mt-1"><Btn primary={i === 1}>{t.choose}</Btn></div></div>)}</div></Shell>;
    case "checkout":
      return <Shell title={t.success!}><div className="grid h-full place-items-center"><div className="text-center"><Tag tone="settle">✓ session verified</Tag><div className="mt-2 text-[0.72rem] text-ink-dim">{t.receipt}</div></div></div></Shell>;
    case "billing-settings":
      return <Shell title={t.settings!} tabs={settingsTabs} active={t.billing!}><div className="flex items-center justify-between border border-line p-2"><div><div className="mono text-[0.6rem] text-ink-faint">{t.balance}</div><div className="mono text-[0.9rem]">917</div></div><Btn primary>{t.buy}</Btn></div><div className="mt-2"><Btn>{t.portal} ↗</Btn></div></Shell>;
    case "usage":
      return <Shell title={t.usage!}><div className="grid grid-cols-3 gap-1">{[[t.runs, "1,284"], [t.tokens, "2.1M"], [t.cost, "$41"]].map(([k, v]) => <div key={k} className="border border-line p-1.5"><div className="mono text-[0.6rem] text-ink-faint">{k}</div><div className="mono text-[0.85rem]">{v}</div></div>)}</div><div className="mt-2 flex h-8 items-end gap-0.5">{[30, 55, 40, 70, 62, 85, 48].map((b, i) => <span key={i} className={cn("flex-1", i === 5 ? "bg-amber" : "bg-line-strong")} style={{ height: `${b}%` }} />)}</div></Shell>;
    case "feature-gating":
      return <Shell title={t.usage!}><div className="relative border border-line p-2"><div className="blur-[3px] text-[0.68rem] text-ink-dim">export.csv · 1,284 rows · …</div><div className="absolute inset-0 grid place-items-center bg-paper/70"><div className="text-center"><Tag tone="amber">{t.gated}</Tag><div className="mt-1 text-[0.66rem] text-ink-dim">{t.gatedBody}</div></div></div></div></Shell>;
    case "payment-poll":
      return <Shell title={t.scan!}><div className="flex items-center gap-3"><div className="grid size-16 grid-cols-6 gap-px bg-paper-raised p-1">{Array.from({ length: 36 }).map((_, i) => <span key={i} className={cn((i * 7) % 3 === 0 ? "bg-ink" : "bg-transparent")} />)}</div><div><div className="mono text-[0.7rem] text-ink">₮29,900</div><div className="mono mt-1 text-[0.62rem] text-ink-faint">{t.waiting}</div><div className="mt-1 flex gap-1"><Tag>QPay</Tag><Tag>PIX</Tag><Tag>UPI</Tag></div></div></div></Shell>;
    case "chat":
      return <Shell title={t.chat!} right={<Tag tone="settle">stub model</Tag>}><div className="flex h-full flex-col gap-1.5"><div className="self-end bg-paper-sunken px-2 py-1 text-[0.68rem]">What's in this quarter's tickets?</div><div className="border border-line px-2 py-1 text-[0.68rem] text-ink-dim">Three themes: onboarding, billing, exports…</div><div className="mt-auto flex gap-1"><div className="h-6 flex-1 border border-line" /><Btn primary>{t.send}</Btn></div></div></Shell>;
    case "artifacts":
      return <Shell title={t.artifacts!}><div className="grid grid-cols-2 gap-1">{[["Q3 summary.md", "3"], ["pricing-audit.md", "1"], ["onboarding.md", "5"], ["export.csv", "1"]].map(([n, v]) => <div key={n} className="border border-line p-1.5"><div className="mono text-[0.64rem]">{n}</div><div className="mt-1 flex items-center justify-between"><Tag>{t.version} {v}</Tag><span className="mono text-[0.6rem] text-ink-faint">{t.copy}</span></div></div>)}</div></Shell>;
    default:
      return <Shell title={item.name}><div className="mono text-[0.64rem] text-ink-faint">{item.description}</div></Shell>;
  }
}

const GROUPS: RegistryGroup[] = ["Auth", "Shell", "Settings", "Commerce", "AI"];

export function RegistryExplorer() {
  const [name, setName] = useState(REGISTRY_ITEMS[0]!.name);
  const [locale, setLocale] = useState<Locale>("en");
  const item = useMemo(() => REGISTRY_ITEMS.find((i) => i.name === name)!, [name]);
  const idx = REGISTRY_ITEMS.findIndex((i) => i.name === name);
  const cmd = `pnpm exec shadcn add https://intelligo.dev/r/${item.name}.json --yes`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("[data-explorer]")) {
        if (e.key === "ArrowRight") setName(REGISTRY_ITEMS[(idx + 1) % REGISTRY_ITEMS.length]!.name);
        if (e.key === "ArrowLeft") setName(REGISTRY_ITEMS[(idx - 1 + REGISTRY_ITEMS.length) % REGISTRY_ITEMS.length]!.name);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

  return (
    <TooltipProvider>
      <div data-explorer className="grid gap-5 lg:grid-cols-[280px_1fr]" tabIndex={0} aria-label="Registry explorer. Use arrow keys to move between items.">
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="tag mb-1.5">{g}</div>
              <div className="flex flex-wrap gap-1">
                {REGISTRY_ITEMS.filter((i) => i.group === g).map((i) => (
                  <button
                    key={i.name}
                    type="button"
                    onClick={() => setName(i.name)}
                    aria-pressed={i.name === name}
                    className={cn(
                      "mono rounded-md border px-2 py-1 text-[0.72rem] transition-colors",
                      i.name === name ? "border-amber bg-amber-soft text-amber" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
                    )}
                  >
                    {i.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-[0.78rem] text-ink">{item.name}</span>
            {item.dependsOn.length > 0 && (
              <span className="mono text-[0.68rem] text-ink-faint">
                requires {item.dependsOn.map((d) => (
                  <button key={d} type="button" onClick={() => setName(d)} className="ml-1 border border-line px-1 text-ink-dim hover:text-ink">{d}</button>
                ))}
              </span>
            )}
            <div className="mono ml-auto flex items-center gap-1 text-[0.7rem]">
              <span className="text-ink-faint">same component ·</span>
              {(["en", "mn"] as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={cn("border px-2 py-0.5", locale === l ? "border-amber bg-amber-soft text-amber" : "border-line text-ink-dim")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 border border-line-strong bg-paper-raised">
            <div className="flex h-7 items-center gap-1.5 border-b border-line px-3">
              <span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" /><span className="size-2 rounded-full bg-line-strong" />
              <span className="mono ml-2 text-[0.66rem] text-ink-faint">app/[{locale}]/…</span>
              <span className="mono ml-auto text-[0.62rem] text-ink-faint">messages/{locale}/{item.name}.json</span>
            </div>
            <div className="relative h-[250px] overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={`${item.name}-${locale}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Preview item={item} l={locale} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <p className="mt-3 text-[0.9rem] text-ink-dim">{item.description}</p>
          <div className="mono mt-2 flex items-center gap-2 rounded-md border border-line bg-paper-sunken px-3 py-1.5 text-[0.74rem]">
            <span className="text-ink-faint">$</span>
            <span className="min-w-0 flex-1 truncate text-ink-dim">{cmd}</span>
            <CopyButton text={cmd} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
