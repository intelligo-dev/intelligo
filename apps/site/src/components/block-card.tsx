import { useEffect, useState } from "react";
import { Showcase, SCENE_FOR_ITEM } from "@/showcase/scenes";
import { BrowserFrame } from "@/components/browser-frame";
import { CommandLine } from "@/components/command-line";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE } from "@/lib/site";
import type { RegistryItem } from "@/lib/registry-items";

/**
 * One registry item on /blocks: its real component, live, beside what
 * installing it brings. Hydrated `client:visible`; the scene mounts after
 * hydration so the static HTML stays a light placeholder.
 */
export function BlockCard({ item }: { item: RegistryItem }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scene = SCENE_FOR_ITEM[item.name] ?? "dashboard";
  const sharedWith = Object.entries(SCENE_FOR_ITEM)
    .filter(([name, s]) => s === scene && name !== item.name)
    .map(([name]) => name);
  const cmd = `pnpm exec shadcn add ${SITE.registryBase}/${item.name}.json`;

  return (
    <TooltipProvider>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <BrowserFrame
          className="lg:self-start"
          messages={`messages/en/${item.name}.json`}
          bodyClassName="aspect-[16/10] max-h-[560px] w-full"
        >
          {mounted ? (
            <Showcase scene={scene} toaster={false} />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
        </BrowserFrame>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="mono text-[0.72rem] text-muted-foreground">
              {item.name}
            </div>
            <h3 className="mt-0.5 text-[1.15rem] font-semibold text-foreground">
              <a href={`#${item.name}`} className="hover:underline">
                {item.title}
              </a>
            </h3>
            <p className="mt-2 text-[0.88rem] text-foreground/70">
              {item.fullDescription}
            </p>
          </div>

          {item.dependsOn.length > 0 && (
            <Chips label="requires">
              {item.dependsOn.map((d) => (
                <Chip key={d} href={`#${d}`}>
                  {d}
                </Chip>
              ))}
            </Chips>
          )}

          {item.primitives.length > 0 && (
            <Chips label="primitives">
              {item.primitives.map((p) => (
                <Chip key={p} href={`/components#${p}`}>
                  {p}
                </Chip>
              ))}
            </Chips>
          )}

          <div className="mono grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.7rem]">
            <span className="text-muted-foreground">files</span>
            <span className="text-foreground/70">{item.fileCount}</span>
            {item.dependencies.length > 0 && (
              <>
                <span className="text-muted-foreground">npm</span>
                <span className="break-words text-foreground/70">
                  {item.dependencies.join(", ")}
                </span>
              </>
            )}
          </div>

          {sharedWith.length > 0 && (
            <p className="mono text-[0.68rem] text-muted-foreground">
              Rendered in the same scene as {sharedWith.join(", ")} — one is the
              frame the other renders in.
            </p>
          )}

          <CommandLine cmd={cmd} className="mt-auto" />
        </div>
      </div>
    </TooltipProvider>
  );
}

function Chips({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="tag mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="mono rounded-md border border-border px-2 py-0.5 text-[0.7rem] text-foreground/70 transition-colors hover:border-foreground/15 hover:text-foreground"
    >
      {children}
    </a>
  );
}
