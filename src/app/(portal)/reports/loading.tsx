import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="h-7 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}
