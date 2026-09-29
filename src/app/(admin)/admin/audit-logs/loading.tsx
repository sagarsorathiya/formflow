import { SkeletonTable } from "@/components/ui/skeleton";

export default function AuditLogsLoading() {
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <div className="h-7 w-28 animate-pulse rounded-md bg-slate-100" />
      </div>
      <SkeletonTable rows={10} cols={5} />
    </main>
  );
}
