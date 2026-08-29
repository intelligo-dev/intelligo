import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { NextjsLogo } from "@/components/logos/nextjs";
import { DrizzleLogo } from "@/components/logos/drizzle";
import { BetterAuthLogo } from "@/components/logos/better-auth";
import { StripeLogo } from "@/components/logos/stripe";
import { NeonLogo } from "@/components/logos/neon";
import { PostgresqlLogo } from "@/components/logos/postgresql";
import { VercelLogo } from "@/components/logos/vercel";
import { AnthropicLogo } from "@/components/logos/anthropic";
import { OpenAILogo } from "@/components/logos/openai";
import { useEffect, useState } from "react";

const ITEMS: { name: string; Logo: React.ComponentType<{ className?: string; mode?: "dark" | "light" }> }[] = [
  { name: "Next.js 16", Logo: NextjsLogo },
  { name: "Drizzle", Logo: DrizzleLogo },
  { name: "Better-Auth", Logo: BetterAuthLogo },
  { name: "Stripe", Logo: StripeLogo },
  { name: "Neon", Logo: NeonLogo },
  { name: "PostgreSQL", Logo: PostgresqlLogo },
  { name: "Vercel", Logo: VercelLogo },
  { name: "Anthropic", Logo: AnthropicLogo },
  { name: "OpenAI", Logo: OpenAILogo },
];

export function LogoStrip() {
  const [mode, setMode] = useState<"dark" | "light">("light");
  useEffect(() => {
    const read = () => setMode(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent" />
      <InfiniteSlider gap={44} speed={38} speedOnHover={10}>
        {ITEMS.map(({ name, Logo }) => (
          <span
            key={name}
            className="mono flex items-center gap-2.5 whitespace-nowrap text-[0.78rem] text-ink-dim"
          >
            <Logo className="size-4 shrink-0 opacity-80" mode={mode} />
            {name}
          </span>
        ))}
      </InfiniteSlider>
    </div>
  );
}
