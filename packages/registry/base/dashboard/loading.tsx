/**
 * Mirrors the page's layout (hero, composer, starter chips) so first
 * paint doesn't jump when the real content arrives.
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-full flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <Skeleton className="mt-8 h-28 w-full rounded-xl" />

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-7 w-48 max-w-full rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
