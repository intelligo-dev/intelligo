import { useState } from "react";

import { BlockPreview } from "@/components/block-preview";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The product on the homepage: the pages a new app already has, as the
 * registry blocks themselves rather than a picture of them. One preview
 * is mounted at a time, so a tab's scene loads when it is chosen.
 */
const PAGES = [
  { block: "dashboard", label: "Dashboard" },
  { block: "chat", label: "Chat" },
  { block: "billing-settings", label: "Billing" },
  { block: "team-settings", label: "Team" },
  { block: "usage", label: "Usage" },
] as const;

type Block = (typeof PAGES)[number]["block"];

export function HomePreview() {
  const [block, setBlock] = useState<Block>("dashboard");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={block} onValueChange={(value) => setBlock(value as Block)}>
          <TabsList>
            {PAGES.map((page) => (
              <TabsTrigger key={page.block} value={page.block}>
                {page.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <a
          href={`/blocks/${block}`}
          className="mono text-[0.72rem] text-muted-foreground no-underline hover:text-foreground"
        >
          shadcn add {block} →
        </a>
      </div>
      <BlockPreview key={block} name={block} />
    </div>
  );
}
