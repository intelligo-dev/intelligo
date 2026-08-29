import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="flex justify-end mb-4">
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex items-center justify-center gap-2 mb-8">
        <Skeleton className="h-1.5 w-8 rounded-full" />
        <Skeleton className="h-1.5 w-1.5 rounded-full" />
        <Skeleton className="h-1.5 w-1.5 rounded-full" />
      </div>
      <div className="rounded-xl border bg-card p-8 space-y-6">
        <div className="space-y-2 text-center">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
