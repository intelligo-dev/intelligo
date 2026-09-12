/**
 * Dashboard skeleton — mirrors the page's actual layout (hero block,
 * three starter cards, recent rows, plan strip) so first paint doesn't
 * jump when the real content arrives.
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 px-4 pt-12 md:pt-16">
        <div className="mx-auto w-full max-w-4xl">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 w-full max-w-2xl space-y-2">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-11 rounded-xl" />
          ))}
        </div>

        <div className="mx-auto mt-12 w-full max-w-2xl space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>

      <div className="px-4 pb-6 pt-4">
        <Skeleton className="mx-auto h-14 w-full max-w-3xl rounded-2xl" />
      </div>
    </div>
  );
}
