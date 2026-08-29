import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BillingSettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-40" />
      </Card>

      <Card className="space-y-4 p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-24" />
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="space-y-4 p-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-9 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}
