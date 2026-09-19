import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { installCommand } from "@/lib/install";
import { Showcase, SCENE_FOR_ITEM, type SceneId } from "@/showcase/scenes";
import { BrowserFrame } from "@/components/browser-frame";
import { CommandLine } from "@/components/command-line";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  REGISTRY_GROUPS,
  REGISTRY_ITEMS,
  blockHref,
  type RegistryItem,
} from "@/lib/registry-items";

/**
 * /blocks: every registry block in a rail, the one chosen rendered large.
 * Each preview is the real component `shadcn add` installs, with fixture
 * data in place of the packages' reads and the item's own `messages/en`.
 * The block on show is in the URL (`?item=`), so a link opens on it.
 */

/** "Auth: Login" → "Login": the rail already names the group. */
const label = (item: RegistryItem) => item.title.replace(/^[^:]+:\s*/, "");

/** A block with no scene of its own shows the scene of the block it requires. */
const sceneOf = (item: RegistryItem): SceneId =>
  SCENE_FOR_ITEM[item.name] ??
  item.dependsOn.map((d) => SCENE_FOR_ITEM[d]).find(Boolean) ??
  "dashboard";

export function RegistryExplorer() {
  const [name, setNameState] = useState(REGISTRY_ITEMS[0]!.name);
  const [mounted, setMounted] = useState(false);
  const rail = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get("item");
    if (wanted && REGISTRY_ITEMS.some((i) => i.name === wanted))
      setNameState(wanted);
    setMounted(true);
  }, []);

  // Replaced, not pushed: thirty blocks are not history.
  const setName = (next: string) => {
    setNameState(next);
    try {
      const url = new URL(location.href);
      url.searchParams.set("item", next);
      history.replaceState(null, "", url);
    } catch {}
  };

  const item = useMemo(
    () => REGISTRY_ITEMS.find((i) => i.name === name)!,
    [name]
  );

  // Up and down step through the rail from inside it only.
  const onRailKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = REGISTRY_ITEMS.findIndex((i) => i.name === name);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next =
      REGISTRY_ITEMS[
        (idx + step + REGISTRY_ITEMS.length) % REGISTRY_ITEMS.length
      ]!;
    setName(next.name);
    rail.current
      ?.querySelector<HTMLButtonElement>(`[data-item="${next.name}"]`)
      ?.focus();
  };

  const list = (onPick?: () => void) =>
    REGISTRY_GROUPS.map((g) => (
      <div key={g} className="mb-6">
        <div className="docs-section-title">{g}</div>
        <ul className="docs-rail">
          {REGISTRY_ITEMS.filter((i) => i.group === g).map((i) => (
            <li key={i.name}>
              <button
                type="button"
                data-item={i.name}
                aria-current={i.name === name ? "true" : undefined}
                onClick={() => {
                  setName(i.name);
                  onPick?.();
                }}
                className="docs-link w-full truncate text-left"
              >
                {label(i)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ));

  const menu = useRef<HTMLDetailsElement>(null);

  return (
    <TooltipProvider>
      <div className="grid lg:grid-cols-[248px_minmax(0,1fr)] xl:border-x xl:border-border">
        <aside className="hidden border-r border-border lg:block">
          <nav
            ref={rail}
            aria-label="Blocks. Up and down move between them."
            onKeyDown={onRailKey}
            className="docs-scroll sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-5 pb-10 pt-8"
          >
            {list()}
          </nav>
        </aside>

        <div className="min-w-0">
          <details
            ref={menu}
            className="docs-mobile-menu group sticky top-14 z-sticky border-b border-border bg-background/90 backdrop-blur-md lg:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-3">
              <span className="flex min-w-0 items-center gap-2 text-[0.85rem]">
                <span className="text-muted-foreground">{item.group}</span>
                <span className="text-muted-foreground" aria-hidden="true">
                  /
                </span>
                <span className="truncate font-medium text-foreground">
                  {label(item)}
                </span>
              </span>
              <span className="mono shrink-0 rounded-lg border border-input px-2.5 py-1 text-[0.72rem] text-foreground">
                Blocks
              </span>
            </summary>
            <nav
              aria-label="Blocks"
              className="docs-scroll max-h-[70dvh] overflow-y-auto border-t border-border px-6 pb-2 pt-4"
            >
              {list(() => menu.current?.removeAttribute("open"))}
            </nav>
          </details>

          <section className="px-6 py-8 md:px-10">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 max-w-[65ch]">
                <h2 className="heading text-2xl font-medium">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <a
                href={blockHref(item.name)}
                className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
              >
                Files and config seams →
              </a>
            </div>
            <CommandLine cmd={installCommand(item.name)} className="mt-4" />

            <BrowserFrame
              className="mt-4"
              messages={`messages/en/${item.name}.json`}
              bodyClassName="aspect-[4/5] w-full sm:aspect-auto sm:h-[min(72dvh,760px)]"
              label={`Preview of the ${item.name} block`}
            >
              {mounted ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={item.name}
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.18 }}
                  >
                    <Showcase scene={sceneOf(item)} />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="mono absolute inset-0 flex animate-pulse items-center justify-center bg-muted text-[0.72rem] text-muted-foreground">
                  Loading preview…
                </div>
              )}
            </BrowserFrame>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
