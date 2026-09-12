import { Skeleton } from "@/components/ui/skeleton";

export default function PrivacyLoading() {
  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-36 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-56 rounded-lg" />
    </div>
  );
}
