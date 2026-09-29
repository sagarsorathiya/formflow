import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PortalNav } from "@/components/layout/portal-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeleteFormButton } from "@/components/builder/delete-form-button";
import { DuplicateFormButton } from "@/components/builder/duplicate-form-button";
import { Layers } from "lucide-react";

export const metadata: Metadata = { title: "Form Builder — FormFlow" };

export default async function BuilderIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "USER") redirect("/dashboard");

  // Read departmentId from the DB rather than the JWT: an admin editing this user's
  // org profile cannot refresh their session, so session.user.departmentId can be stale
  // for up to the full 8h session lifetime.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { departmentId: true },
  });

  const forms = await prisma.form.findMany({
    where:
      session.user.role === "SUPER_ADMIN"
        ? { status: { not: "ARCHIVED" } }
        : {
            status: { not: "ARCHIVED" },
            OR: [
              { departmentId: dbUser?.departmentId ?? "__none__" },
              { createdById: session.user.id },
            ],
          },
    include: {
      department: { select: { name: true } },
      _count: { select: { versions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <PortalNav user={session.user}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Form Builder</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Create and manage department forms</p>
          </div>
          <a
            href="/builder/new"
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition whitespace-nowrap"
          >
            + New Form
          </a>
        </div>

        {forms.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No forms yet"
            description="Create your first form to start digitising your department workflows."
            action={
              <a href="/builder/new" className="text-sm font-semibold text-primary hover:underline">
                Create your first form →
              </a>
            }
            className="bg-white border border-slate-200 rounded-2xl py-16 dark:bg-card dark:border-border"
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-card
                        dark:bg-card dark:border-border dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-border dark:bg-muted/30">
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Department</th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell whitespace-nowrap">Updated</th>
                    <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Versions</th>
                    <th scope="col" className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/6">
                  {forms.map((form) => (
                    <tr key={form.id} className="hover:bg-slate-50/60 dark:hover:bg-muted/40 transition-colors group">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-200">{form.title}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden sm:table-cell">{form.department?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={form.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell whitespace-nowrap">
                        {form.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs text-center hidden lg:table-cell">{form._count.versions}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <DuplicateFormButton formId={form.id} title={form.title} />
                          <DeleteFormButton formId={form.id} />
                          <a
                            href={`/builder/${form.id}`}
                            className="text-xs font-semibold whitespace-nowrap transition-colors
                                       text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                          >
                            Edit →
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PortalNav>
  );
}
