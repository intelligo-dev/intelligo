import { MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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

export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Switch between light and dark theme"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "relative size-9 overflow-hidden",
        className
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
  );
}
