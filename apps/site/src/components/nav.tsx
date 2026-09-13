import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { NAV, SITE } from "@/lib/site";
import { GitHubStarButton } from "@/components/elements/github-star-button";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.classList.contains("dark") ? "dark" : "light"
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => mo.disconnect();
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  return { theme, toggle };
}

/** `/#framework` → `framework`; a path or external link has no section. */
function sectionId(href: string): string | null {
  const i = href.indexOf("#");
  return i === -1 ? null : href.slice(i + 1);
}

/** how far down the page we are, 0 → 1, for the hairline under the nav */
function useReadingProgress() {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setV(max > 0 ? Math.min(1, window.scrollY / max) : 0);
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
  return v;
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.2, 0.5] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ids.join(",")]);
  return active;
}

export function Nav({ current }: { current?: string }) {
  const { theme, toggle } = useTheme();
  const active = useScrollSpy(
    NAV.map((n) => sectionId(n.href)).filter((id): id is string => !!id)
  );
  const [open, setOpen] = useState(false);
  const progress = useReadingProgress();

  const isActive = (href: string) => {
    const id = sectionId(href);
    if (id) return active === id;
    return current !== undefined && href === current;
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div
        className="pointer-events-none absolute bottom-[-1px] left-0 h-px bg-foreground transition-[width] duration-150 ease-linear"
        style={{ width: `${progress * 100}%` }}
        aria-hidden="true"
      />
      <div className="mx-auto flex h-14 max-w-[1152px] items-center justify-between gap-4 px-6">
        <a
          href="/"
          className="heading flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight no-underline"
        >
          <span
            className="inline-block size-3 rounded-[3px] bg-foreground"
            aria-hidden="true"
          />
          {SITE.name}
        </a>

        <div className="flex items-center gap-1">
          <div className="hidden items-center md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[0.85rem] text-muted-foreground no-underline transition-colors hover:text-foreground",
                  isActive(n.href) && "text-foreground"
                )}
              >
                {n.label}
              </a>
            ))}
            <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={
              theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            {theme === "dark" ? "☾" : "☼"}
          </button>
          {SITE.githubPublic ? (
            <GitHubStarButton
              owner={SITE.githubOwner}
              repo={SITE.githubRepo}
              variant="outline"
            />
          ) : (
            <a
              href={SITE.github}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              GitHub
            </a>
          )}
          <a
            href="/#quickstart"
            className={cn(
              buttonVariants({ size: "sm" }),
              "hidden sm:inline-flex"
            )}
          >
            Get started
          </a>
          <button
            type="button"
            className={cn(
              buttonVariants({ variant: "outline", size: "icon-sm" }),
              "md:hidden"
            )}
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "×" : "≡"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-[1152px] flex-col px-6 py-2">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-[0.95rem] text-muted-foreground no-underline hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
            <a
              href="/#quickstart"
              onClick={() => setOpen(false)}
              className="py-2.5 text-[0.95rem] text-foreground no-underline"
            >
              Get started
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
