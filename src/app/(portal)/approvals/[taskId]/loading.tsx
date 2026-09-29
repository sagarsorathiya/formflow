import { SkeletonForm, SkeletonTimeline } from "@/components/ui/skeleton";

export default function ApprovalLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 space-y-1">
        <div className="h-7 w-48 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
            <SkeletonForm rows={5} />
          </div>
          <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
            <div className="h-4 w-24 mb-4 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
            <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-muted/70" />
            <div className="mt-4 flex gap-2 justify-end">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 w-24 animate-pulse rounded-xl bg-slate-100 dark:bg-muted/70" />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
          <div className="h-4 w-24 mb-4 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
          <SkeletonTimeline steps={3} />
        </div>
      </div>
    </div>
  );
}
