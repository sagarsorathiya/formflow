import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { RoleMappingManager } from "./role-mapping-manager";

export const metadata: Metadata = { title: "Admin — Role Mappings" };

export default async function RoleMappingsPage() {
  const [mappings, departments] = await Promise.all([
    prisma.roleMapping.findMany({ orderBy: { adGroup: "asc" } }),
    prisma.department.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Role Mappings</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Map Active Directory groups to FormFlow application roles. Applied on every login and nightly sync.
        </p>
      </div>
      <RoleMappingManager initialMappings={mappings} departments={departments} />
    </div>
  );
}
