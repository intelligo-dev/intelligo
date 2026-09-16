import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Showcase, SCENE_FOR_ITEM } from "@/showcase/scenes";
import { BrowserFrame } from "@/components/browser-frame";
import { CommandLine } from "@/components/command-line";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  REGISTRY_ITEMS,
  blockHref,
  type RegistryGroup,
} from "@/lib/registry-items";

/**
 * Every page family from registry.json (the count comes from the sync). Every item renders the real
 * registry component — the files `shadcn add` installs — with fixture
 * data in place of the packages' reads and the item's own `messages/en`
 * (ADR-0010). Two items that ship a frame and a page share a scene.
 */

const GROUPS: RegistryGroup[] = ["Auth", "Shell", "Settings", "Commerce", "AI"];

export function RegistryExplorer() {
  const [name, setName] = useState(REGISTRY_ITEMS[0]!.name);
  const item = useMemo(
    () => REGISTRY_ITEMS.find((i) => i.name === name)!,
    [name]
  );
  const idx = REGISTRY_ITEMS.findIndex((i) => i.name === name);
  const cmd = `pnpm exec shadcn add https://intelligo.dev/r/${item.name}.json --yes`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("[data-explorer]")
      ) {
        if (e.key === "ArrowRight")
          setName(REGISTRY_ITEMS[(idx + 1) % REGISTRY_ITEMS.length]!.name);
        if (e.key === "ArrowLeft")
          setName(
            REGISTRY_ITEMS[
              (idx - 1 + REGISTRY_ITEMS.length) % REGISTRY_ITEMS.length
            ]!.name
          );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

  return (
    <TooltipProvider>
      <div
        data-explorer
        className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"
        tabIndex={0}
        aria-label="Registry explorer. Use arrow keys to move between items."
      >
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
                      i.name === name
                        ? "border-foreground bg-muted text-foreground"
                        : "border-border text-foreground/70 hover:border-foreground/15 hover:text-foreground"
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
            <span className="mono text-[0.78rem] text-foreground">
              {item.name}
            </span>
            {item.dependsOn.length > 0 && (
              <span className="mono text-[0.68rem] text-muted-foreground">
                requires{" "}
                {item.dependsOn.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setName(d)}
                    className="ml-1 border border-border px-1 text-foreground/70 hover:text-foreground"
                  >
                    {d}
                  </button>
                ))}
              </span>
            )}
            <div className="mono ml-auto flex items-center gap-1 text-[0.7rem]">
              <span className="text-muted-foreground">
                the real component ·{" "}
                <span className="text-foreground">messages/en</span>
              </span>
            </div>
          </div>

          <BrowserFrame
            className="mt-2"
            messages={`messages/en/${item.name}.json`}
            bodyClassName="h-[300px]"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={item.name}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Showcase scene={SCENE_FOR_ITEM[item.name] ?? "dashboard"} />
              </motion.div>
            </AnimatePresence>
          </BrowserFrame>

          <p className="mt-3 text-[0.9rem] text-foreground/70">
            {item.description}{" "}
            <a
              href={blockHref(item.name)}
              className="mono whitespace-nowrap text-[0.75rem] text-muted-foreground hover:text-foreground"
            >
              files, seams, install →
            </a>
          </p>
          <CommandLine cmd={cmd} className="mt-2" />
        </div>
      </div>
    </TooltipProvider>
  );
}
