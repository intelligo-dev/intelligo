import { useEffect, useRef, useState } from "react";
import { MenuIcon, MoonIcon, SunIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { NAV, SITE } from "@/lib/site";
import { GitHubStarButton } from "@/components/elements/github-star-button";

/**
 * The theme is the `dark` class on <html>, stamped before first paint by
 * Base.astro. The toggle flips it and nothing here holds it as state:
 * both icons are in the markup and CSS shows the one that applies, so the
 * server's HTML is right for either theme and nothing swaps on hydrate.
 */
function toggleTheme() {
  const next = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem("theme", next);
  } catch {}
}

/**
 * How far down the page we are, for the hairline under the nav. Written
 * straight to the element as a transform: a scroll frame re-renders
 * nothing and lays out nothing.
 */
function useReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const v = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${v})`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return bar;
}

export function Nav({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  const bar = useReadingProgress();
  const root = useRef<HTMLElement>(null);

  // the menu closes the ways a menu is expected to: Escape, a click
  // anywhere else, and the viewport growing past the point it exists
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const mq = window.matchMedia("(min-width: 768px)");
    const onWide = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    mq.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      mq.removeEventListener("change", onWide);
    };
  }, [open]);

  /** `/docs` is active on `/docs/cli` too; `/` only on itself. */
  const isActive = (href: string) =>
    current !== undefined &&
    (current === href || current.startsWith(`${href}/`));

  const measure = "mx-auto max-w-7xl px-6 md:px-10";

  return (
    <nav
      ref={root}
      aria-label="Main"
      // one above the pages' own sticky bars, which its menu opens over
      className="sticky top-0 z-[calc(var(--z-sticky)+1)] border-b border-border bg-background/95 backdrop-blur-md"
    >
      <div
        ref={bar}
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px origin-left scale-x-0 bg-foreground"
        aria-hidden="true"
      />
      <div
        className={cn(measure, "flex h-14 items-center justify-between gap-4")}
      >
        <a
          href="/"
          className="heading -my-2 flex items-center gap-2 py-2 text-[1.05rem] font-semibold tracking-tight no-underline"
        >
          <span
            className="inline-block size-3 rounded-[3px] bg-foreground"
            aria-hidden="true"
          />
          {SITE.name}
        </a>

        <div className="flex items-center gap-1.5">
          <div className="hidden items-center md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-[0.85rem] text-muted-foreground no-underline transition-colors duration-fast hover:bg-accent hover:text-foreground",
                  isActive(n.href) && "bg-accent font-medium text-foreground"
                )}
              >
                {n.label}
              </a>
            ))}
            <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Switch between light and dark theme"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "relative size-9 overflow-hidden"
            )}
          >
            <SunIcon
              aria-hidden="true"
              className="absolute scale-100 rotate-0 opacity-100 transition-[rotate,scale,opacity] duration-slow ease-standard dark:scale-50 dark:-rotate-90 dark:opacity-0"
            />
            <MoonIcon
              aria-hidden="true"
              className="absolute scale-50 rotate-90 opacity-0 transition-[rotate,scale,opacity] duration-slow ease-standard dark:scale-100 dark:rotate-0 dark:opacity-100"
            />
          </button>
          {SITE.githubPublic ? (
            <GitHubStarButton owner={SITE.githubOwner} repo={SITE.githubRepo} />
          ) : (
            <a
              href={SITE.github}
              className={cn(buttonVariants({ variant: "outline" }), "h-9")}
            >
              GitHub
            </a>
          )}
          <a
            href={SITE.start}
            className={cn(buttonVariants(), "hidden h-9 px-4 sm:inline-flex")}
          >
            Get started
          </a>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "size-9 border-foreground/20 bg-background md:hidden"
            )}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <XIcon aria-hidden="true" />
            ) : (
              <MenuIcon aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {/* over the page, not in its flow: opening it moves nothing */}
      <div
        id="site-menu"
        hidden={!open}
        className="absolute inset-x-0 top-full border-y border-border bg-background shadow-lg md:hidden"
      >
        <div className={cn(measure, "flex flex-col py-2")}>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={cn(
                "py-3 text-[0.95rem] text-muted-foreground no-underline hover:text-foreground",
                isActive(n.href) && "font-medium text-foreground"
              )}
            >
              {n.label}
            </a>
          ))}
          <a
            href={SITE.start}
            onClick={() => setOpen(false)}
            className="py-3 text-[0.95rem] font-medium text-foreground no-underline"
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}
