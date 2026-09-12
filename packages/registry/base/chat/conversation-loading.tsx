import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex-1 space-y-6 px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
          <Skeleton className="h-24 w-3/4 rounded-lg" />
          <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
