import { SkeletonForm } from "@/components/ui/skeleton";

export default function FillFormLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 space-y-1">
        <div className="h-7 w-48 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
      </div>
      <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
        <SkeletonForm rows={6} />
        <div className="mt-6 flex justify-end">
          <div className="h-9 w-28 animate-pulse rounded-xl bg-slate-100 dark:bg-muted/70" />
        </div>
      </div>
    </div>
  );
}
