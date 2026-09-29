import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { User, Shield, Bell, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DelegationManager } from "./delegation-manager";
import { OrgSettings } from "./org-settings";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Settings — FormFlow" };

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetch current org info from DB (session JWT may be stale after org update)
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      companyId: true,
      departmentId: true,
      designation: true,
      company: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

  // Department is null for Company Head designations — it must NOT be part of this
  // guard, or a Company Head sees an empty org profile even though one is set.
  const orgInfo = dbUser?.companyId && dbUser.designation
    ? {
        companyId: dbUser.companyId,
        departmentId: dbUser.departmentId,
        designation: dbUser.designation,
        companyName: dbUser.company?.name ?? "—",
        departmentName: dbUser.department?.name ?? "—",
      }
    : null;

  const roleLabel: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    DEPT_ADMIN: "Department Admin",
    USER: "User",
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account preferences and organisation profile."
      />

      {/* Profile card */}
      <section className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                          dark:bg-card dark:border-border dark:shadow-none">
        <div className="flex items-center gap-4 px-6 py-5 border-b border-black/6 dark:border-border">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            aria-hidden="true"
          >
            {(session.user.name ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{session.user.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{session.user.email}</p>
          </div>
          <div className="ml-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg
                             bg-orange-50 text-orange-700 border border-orange-200
                             dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/25">
              <Shield className="w-3 h-3" aria-hidden="true" />
              {roleLabel[session.user.role] ?? session.user.role}
            </span>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Identity (from Active Directory)</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Full Name</dt>
              <dd className="text-slate-800 dark:text-slate-200 font-medium">{session.user.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Email</dt>
              <dd className="text-slate-800 dark:text-slate-200">{session.user.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Role</dt>
              <dd className="text-slate-800 dark:text-slate-200">{roleLabel[session.user.role] ?? session.user.role}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400 flex items-center gap-1.5 border-t border-black/6 dark:border-border pt-4">
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 inline-block" />
            Name and email are managed by your organisation&apos;s Active Directory. Contact IT to update.
          </p>
        </div>
      </section>

      {/* Organisation section */}
      <section className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                          dark:bg-card dark:border-border dark:shadow-none">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-black/6 dark:border-border">
          <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Organisation Profile</h2>
        </div>
        <OrgSettings orgInfo={orgInfo} />
      </section>

      {/* Delegation */}
      <section className="bg-white border border-black/8 rounded-2xl overflow-hidden shadow-card
                          dark:bg-card dark:border-border dark:shadow-none">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-black/6 dark:border-border">
          <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Approval Delegation</h2>
        </div>
        <div className="px-6 py-5">
          <DelegationManager currentUserId={session.user.id} />
        </div>
      </section>
    </div>
  );
}
