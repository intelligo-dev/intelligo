import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <Skeleton className="ml-auto h-10 w-2/3 rounded-xl" />
          <Skeleton className="h-24 w-3/4 rounded-lg" />
          <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
