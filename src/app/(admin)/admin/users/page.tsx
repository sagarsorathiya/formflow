import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Admin — Users" };

const ROLE_VARIANTS: Record<string, "success" | "warning" | "secondary"> = {
  SUPER_ADMIN: "success",
  DEPT_ADMIN: "warning",
  USER: "secondary",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"));
  const pageSize = 30;
  const q = searchParams.q?.trim();
  const roleFilter = searchParams.role;

  const where = {
    ...(q
      ? {
          OR: [
            { displayName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { samAccountName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(roleFilter ? { role: roleFilter as never } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        department: { select: { name: true } },
        company: { select: { code: true } },
      },
      orderBy: { displayName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  const inputCls = `rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
                    border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400
                    dark:border-border dark:bg-muted/60 dark:text-slate-200 dark:placeholder:text-slate-500`;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Users & Roles"
        description={`${total} users synced from Active Directory`}
      />

      {/* Filters */}
      <form method="GET" className="flex gap-2 flex-wrap items-center">
        <input name="q" defaultValue={q} placeholder="Search name, email, username..."
          className={`${inputCls} w-full sm:w-72`} />
        <select name="role" defaultValue={roleFilter ?? ""} className={`${inputCls} w-full sm:w-auto`}>
          <option value="">All roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="DEPT_ADMIN">Dept Admin</option>
          <option value="USER">User</option>
        </select>
        <button type="submit"
          className="px-4 py-2 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
          Search
        </button>
        {(q || roleFilter) && (
          <a href="/admin/users"
            className="px-3 py-2 text-sm rounded-xl transition-colors
                       text-slate-500 border border-slate-200 bg-white hover:bg-slate-50
                       dark:text-slate-400 dark:border-border dark:bg-card dark:hover:bg-muted/70">
            Clear
          </a>
        )}
      </form>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description={q || roleFilter ? "Try different search criteria." : "No users have been synced yet."}
          className="bg-white rounded-2xl border border-slate-200 py-16 shadow-card
                     dark:bg-card dark:border-border dark:shadow-none"
        />
      ) : (
        <div className="rounded-2xl border overflow-hidden shadow-card
                        border-slate-200 bg-white dark:border-border dark:bg-card dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 border-slate-100 dark:border-border dark:bg-muted/30">
                  <th scope="col" className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th scope="col" className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                  <th scope="col" className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Dept / Company</th>
                  <th scope="col" className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  <th scope="col" className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th scope="col" className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/6">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-muted/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{u.displayName}</p>
                        <p className="text-xs text-slate-400">@{u.samAccountName}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 hidden md:table-cell">{u.email}</td>
                    <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 text-xs hidden sm:table-cell">
                      {u.department?.name ?? "—"}{u.company ? ` · ${u.company.code}` : ""}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={ROLE_VARIANTS[u.role] ?? "secondary"}>
                        {u.role.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                        u.active
                          ? "bg-green-50 text-green-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                      }`}>
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a href={`/admin/users/${u.id}`}
                        className="text-xs font-semibold whitespace-nowrap transition-colors
                                   text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300">
                        Edit →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm">
          {page > 1 && (
            <a href={`/admin/users?page=${page - 1}${q ? `&q=${q}` : ""}${roleFilter ? `&role=${roleFilter}` : ""}`}
              className="px-3 py-1.5 text-sm rounded-xl transition-colors
                         border border-slate-200 text-slate-600 bg-white hover:bg-slate-50
                         dark:border-border dark:text-slate-300 dark:bg-card dark:hover:bg-muted/70">
              ← Previous
            </a>
          )}
          <span className="text-slate-500 px-2">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a href={`/admin/users?page=${page + 1}${q ? `&q=${q}` : ""}${roleFilter ? `&role=${roleFilter}` : ""}`}
              className="px-3 py-1.5 text-sm rounded-xl transition-colors
                         border border-slate-200 text-slate-600 bg-white hover:bg-slate-50
                         dark:border-border dark:text-slate-300 dark:bg-card dark:hover:bg-muted/70">
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
