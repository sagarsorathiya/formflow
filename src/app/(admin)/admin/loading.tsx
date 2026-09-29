import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-6 space-y-1">
        <div className="h-7 w-36 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={6} cols={5} />
    </main>
  );
}
