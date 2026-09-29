import { SkeletonTable } from "@/components/ui/skeleton";

export default function BuilderListLoading() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded-md bg-slate-100" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-100" />
      </div>
      <SkeletonTable rows={5} cols={5} />
    </div>
  );
}
