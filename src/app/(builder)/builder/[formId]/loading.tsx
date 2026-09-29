export default function BuilderLoading() {
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Toolbar skeleton */}
      <div className="border-b border-slate-200 bg-white px-4 h-12 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
      {/* 3-pane skeleton */}
      <div className="flex flex-1 min-h-0">
        <div className="w-56 shrink-0 border-r border-slate-200 bg-white p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
        <div className="flex-1 bg-slate-50 p-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-white border border-slate-200" />
            ))}
          </div>
        </div>
        <div className="w-72 shrink-0 border-l border-slate-200 bg-white p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
