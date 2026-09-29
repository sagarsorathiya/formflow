import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { UserRoleEditor } from "./user-role-editor";
import { UserOrgEditor } from "./org-editor";
import { UserOrgAssignments } from "./org-assignments";
import { DeleteUserButton } from "./delete-user-button";

export const metadata: Metadata = { title: "Admin — Edit User" };

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      department: { select: { id: true, name: true } },
      company: { select: { code: true, name: true } },
    },
  });

  if (!user) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <a href="/admin/users"
          className="text-xs text-orange-600 dark:text-orange-400 hover:opacity-80 transition-opacity">
          ← Users
        </a>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{user.displayName}</h1>
        <p className="text-sm text-slate-500">
          @{user.samAccountName} &bull; {user.email}
        </p>
      </div>

      {/* Info */}
      <div className="rounded-xl border p-5 space-y-2 text-sm
                      bg-white border-slate-200 dark:bg-card dark:border-border">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-slate-500">Last Login</dt>
          <dd className="text-slate-900 dark:text-slate-200">
            {user.lastLoginAt
              ? user.lastLoginAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
              : "Never"}
          </dd>
          <dt className="text-slate-500">AD Groups</dt>
          <dd className="text-slate-900 dark:text-slate-200 text-xs">
            {user.adGroups.length > 0 ? user.adGroups.join(", ") : "—"}
          </dd>
        </dl>
      </div>

      {/* Organisation profile editor */}
      <UserOrgEditor
        userId={user.id}
        currentCompanyName={user.company?.name ?? null}
        currentDepartmentName={user.department?.name ?? null}
        currentDesignation={user.designation}
      />

      {/* Additional org mappings */}
      <UserOrgAssignments userId={user.id} />

      {/* Role editor */}
      <UserRoleEditor
        userId={user.id}
        currentRole={user.role}
        currentActive={user.active}
      />

      {/* Danger zone */}
      <div className="rounded-xl border border-red-100 dark:border-red-500/20 p-5 space-y-3 bg-white dark:bg-card">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Danger Zone</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Permanent deletion is only possible if the user has no submitted forms. Deactivate the account instead to block login while preserving records.
          </p>
        </div>
        <DeleteUserButton userId={user.id} displayName={user.displayName} />
      </div>
    </div>
  );
}
