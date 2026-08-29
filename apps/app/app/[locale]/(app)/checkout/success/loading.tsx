import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutSuccessLoading() {
  return (
    <div className="container max-w-2xl py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <Skeleton className="mb-4 h-16 w-16 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="mx-auto h-4 w-56" />
        </CardContent>
      </Card>
    </div>
  );
}
