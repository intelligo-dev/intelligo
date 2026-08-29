import { GitHubActivityCalendar } from "@/components/elements/github-activity-calendar";
import type { ContributionDay } from "@/lib/proof";

/**
 * @elements/github-activity-calendar fed with static per-day commit
 * counts from this repository (the repo is private, so nothing is
 * fetched). Colour scheme is remapped to the palette via CSS.
 */
export function CommitHeatmap({ days, year, commits, firstCommit }: { days: ContributionDay[]; year: number; commits: number; firstCommit: string }) {
  return (
    <div>
      <div className="[&_[class*='bg-orange-']]:!bg-[color:var(--foreground)] [&_[class*='bg-orange-200']]:!opacity-35 [&_[class*='bg-orange-400']]:!opacity-60 [&_[class*='bg-orange-500']]:!opacity-80 [&_[class*='bg-neutral-']]:!bg-[color:var(--line)] [&_[class*='text-muted-foreground']]:!text-[color:var(--ink-faint)] [&_*]:!font-[family-name:var(--font-mono)] overflow-x-auto">
        <GitHubActivityCalendar username="intelligo" staticData={days} year={year} colorScheme="orange" className="min-w-[640px] !border-0 !bg-transparent !p-0" />
      </div>
      <p className="mono mt-2 text-[0.72rem] text-ink-faint">
        {commits.toLocaleString()} commits since {firstCommit} · counted from the repository at build time
      </p>
    </div>
  );
}
