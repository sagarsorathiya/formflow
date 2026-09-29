import { SkeletonForm } from "@/components/ui/skeleton";

export default function UserDetailLoading() {
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <div className="h-7 w-36 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <SkeletonForm rows={6} />
      </div>
    </main>
  );
}
