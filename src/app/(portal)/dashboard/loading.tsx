import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="container mx-auto max-w-7xl px-4 md:px-6 py-8">
      <div className="mb-6 space-y-1">
        <div className="h-7 w-32 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={6} cols={5} />
    </main>
  );
}
