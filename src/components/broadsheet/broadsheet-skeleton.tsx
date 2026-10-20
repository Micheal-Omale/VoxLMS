import { Skeleton } from "@/components/ui/skeleton";

export function BroadsheetSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="h-[600px] w-full rounded-xl border border-rule bg-card p-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
