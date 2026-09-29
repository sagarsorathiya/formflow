import { SkeletonForm } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="h-7 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-muted/70" />
      </div>
      <div className="bg-white border border-black/8 rounded-2xl p-6 shadow-card dark:bg-card dark:border-border dark:shadow-none">
        <SkeletonForm rows={4} />
      </div>
    </div>
  );
}
