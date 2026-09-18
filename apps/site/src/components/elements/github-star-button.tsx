"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * A link to the repository that also says how many stars it has.
 *
 * A link, not a button that opens a window: it can be middle-clicked,
 * copied and read as what it is. The count comes from GitHub's public
 * API, which allows an address sixty calls an hour — so one answer is
 * kept for an hour — "no answer" included, so a repository that is not
 * public yet is asked about once, not on every page. With no answer the
 * count is simply not shown; the link never depends on it.
 */

interface GitHubStarButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  owner: string;
  repo: string;
  staticCount?: number;
  showCount?: boolean;
}

const TTL_MS = 60 * 60 * 1000;

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/** `undefined`: nothing fresh is stored. `null`: asked within the hour, no answer. */
function readCached(key: string): number | null | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { count, at } = JSON.parse(raw) as {
      count: number | null;
      at: number;
    };
    if (Date.now() - at >= TTL_MS) return undefined;
    return typeof count === "number" && Number.isFinite(count) ? count : null;
  } catch {
    return undefined;
  }
}

function writeCached(key: string, count: number | null) {
  try {
    localStorage.setItem(key, JSON.stringify({ count, at: Date.now() }));
  } catch {}
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  );
}

export function GitHubStarButton({
  owner,
  repo,
  staticCount,
  showCount = true,
  className,
  ...props
}: GitHubStarButtonProps) {
  const [count, setCount] = useState<number | null>(staticCount ?? null);

  useEffect(() => {
    if (staticCount !== undefined || !showCount) return;
    const key = `stars:${owner}/${repo}`;
    const cached = readCached(key);
    if (cached !== undefined) {
      setCount(cached);
      return;
    }
    let live = true;
    fetch(`https://api.github.com/repos/${owner}/${repo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stargazers_count?: number } | null) => {
        const n = typeof data?.stargazers_count === "number" ? data.stargazers_count : null;
        writeCached(key, n);
        if (live) setCount(n);
      })
      .catch(() => writeCached(key, null));
    return () => {
      live = false;
    };
  }, [owner, repo, staticCount, showCount]);

  return (
    <a
      data-slot="github-star-button"
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      rel="noreferrer"
      aria-label={
        count !== null
          ? `Star on GitHub, ${count} stars`
          : "Star on GitHub"
      }
      className={cn(
        buttonVariants({ variant: "outline" }),
        "group/star h-9 gap-2 bg-background px-3.5 no-underline",
        className
      )}
      {...props}
    >
      <StarIcon className="size-4 transition-transform duration-normal ease-standard group-hover/star:scale-110" />
      <span>Star</span>
      {showCount && count !== null && (
        <>
          <span className="h-4 w-px bg-current opacity-20" aria-hidden="true" />
          <span className="tabular-nums">{formatNumber(count)}</span>
        </>
      )}
    </a>
  );
}
