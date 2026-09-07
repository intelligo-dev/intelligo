import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Showcase, SCENE_FOR_ITEM } from "@/showcase/scenes";
import { CopyButton } from "@/components/copy-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { REGISTRY_ITEMS, type RegistryGroup } from "@/lib/registry-items";

/**
 * 25 page families from registry.json. Every item renders the real
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
        className="grid gap-5 lg:grid-cols-[280px_1fr]"
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
                        ? "border-amber bg-amber-soft text-amber"
                        : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
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
                requires{" "}
                {item.dependsOn.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setName(d)}
                    className="ml-1 border border-line px-1 text-ink-dim hover:text-ink"
                  >
                    {d}
                  </button>
                ))}
              </span>
            )}
            <div className="mono ml-auto flex items-center gap-1 text-[0.7rem]">
              <span className="text-ink-faint">
                the real component ·{" "}
                <span className="text-ink">messages/en</span>
              </span>
            </div>
          </div>

          <div className="mt-2 border border-line-strong bg-paper-raised">
            <div className="flex h-7 items-center gap-1.5 border-b border-line px-3">
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="mono ml-2 text-[0.66rem] text-ink-faint">
                app/[en]/…
              </span>
              <span className="mono ml-auto text-[0.62rem] text-ink-faint">
                messages/en/{item.name}.json
              </span>
            </div>
            <div className="relative h-[300px] overflow-hidden">
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
