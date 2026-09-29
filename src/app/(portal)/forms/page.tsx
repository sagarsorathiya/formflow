import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { isFormVisibleToUser, isCompanyHeadDesignation } from "@/lib/audience";

export const metadata: Metadata = { title: "Available Forms — FormFlow" };

export default async function FormsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { companyId: true, departmentId: true, designation: true, adGroups: true },
  });

  const forms = await prisma.form.findMany({
    where: { status: "PUBLISHED" },
    include: {
      department: { select: { name: true } },
      audience: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const isCompanyHead = await isCompanyHeadDesignation(user?.designation ?? null);
  const audienceContext = user ? { ...user, isCompanyHead, role: session.user.role } : null;
  const visible = forms.filter((form) => isFormVisibleToUser(form.audience, audienceContext));

  const grouped = visible.reduce<Record<string, typeof visible>>((acc, form) => {
    const dept = form.department?.name ?? "General";
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(form);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Available Forms"
        description="Forms published to you — click any card to start filling."
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No forms available"
          description="There are no forms published to your account yet. Check back later or contact your department admin."
          className="bg-white border border-black/8 rounded-2xl py-16 shadow-card
                     dark:bg-card dark:border-border dark:shadow-none"
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([dept, deptForms]) => (
            <section key={dept} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {dept}
                </h2>
                <div className="flex-1 h-px bg-black/8 dark:bg-muted/70" />
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {deptForms.length} form{deptForms.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {deptForms.map((form) => (
                  <Link
                    key={form.id}
                    href={`/forms/${form.slug ?? form.id}`}
                    className="group bg-white border border-black/8 rounded-2xl p-5
                               hover:border-black/15 hover:-translate-y-0.5 hover:shadow-md
                               transition-all duration-150 flex flex-col gap-3
                               dark:bg-card dark:border-border dark:hover:bg-muted/80 dark:hover:border-white/15 dark:hover:shadow-none"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-white" aria-hidden="true" />
                      </div>
                      <ArrowRight
                        className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-orange-500 dark:group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        {form.title}
                      </h3>
                      {form.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {form.description}
                        </p>
                      )}
                    </div>
                    <div className="mt-auto pt-2 border-t border-black/6 dark:border-border flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold">
                        {dept}
                      </span>
                      <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Fill now →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
