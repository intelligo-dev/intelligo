import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="container mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-3">
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="border-t">
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-4 w-4 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
