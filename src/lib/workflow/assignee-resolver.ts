/**
 * Resolves an ApprovalNodeConfig's assigneeStrategy to concrete user IDs.
 * Called at task-creation time — result is snapshotted into resolvedAssigneeIds.
 */

import { prisma } from "@/lib/prisma";
import type { ApprovalNodeConfig, AssigneeStrategy } from "@/lib/types/schema";

interface SubmissionContext {
  submittedById: string;
  departmentId: string | null; // from formVersion.form
}

// ─── Legacy field-name mapping ────────────────────────────────────────────────
// The seed script used older field names. This normaliser lets both formats work
// so existing form versions in the DB don't need a migration.

const LEGACY_STRATEGY_MAP: Record<string, AssigneeStrategy> = {
  manager_of_submitter: "submitter-manager",
  department_head: "dept-head",
  designation_in_dept: "designation",
  specific_users: "specific-users",
};

function normalizeConfig(raw: ApprovalNodeConfig): ApprovalNodeConfig {
  const r = raw as unknown as Record<string, unknown>;
  const strategy: AssigneeStrategy =
    raw.assigneeStrategy ??
    (LEGACY_STRATEGY_MAP[r.strategy as string] as AssigneeStrategy) ??
    "submitter-manager";

  // Legacy seed stored designation as `designation`, users as `userIds`
  let assigneeValue = raw.assigneeValue;
  if (assigneeValue === undefined && r.designation) assigneeValue = r.designation as string;
  if (assigneeValue === undefined && Array.isArray(r.userIds)) assigneeValue = r.userIds as string[];

  // Legacy seed used `requireAll` instead of `anyOneApproves`
  const anyOneApproves =
    raw.anyOneApproves !== undefined
      ? raw.anyOneApproves
      : r.requireAll !== undefined
        ? !(r.requireAll as boolean)
        : true;

  return { ...raw, assigneeStrategy: strategy, assigneeValue, anyOneApproves };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function resolveAssignees(
  config: ApprovalNodeConfig,
  ctx: SubmissionContext,
  dataJson: Record<string, unknown>
): Promise<string[]> {
  const baseIds = await resolveBaseAssignees(normalizeConfig(config), ctx, dataJson);
  return expandWithDelegates(baseIds);
}

async function resolveBaseAssignees(
  config: ApprovalNodeConfig,
  ctx: SubmissionContext,
  dataJson: Record<string, unknown>
): Promise<string[]> {
  switch (config.assigneeStrategy) {
    case "specific-users": {
      const val = config.assigneeValue;
      if (!val) return [];
      const ids = Array.isArray(val) ? val : [val];
      // Verify users exist and are active
      const users = await prisma.user.findMany({
        where: { id: { in: ids }, active: true },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    case "submitter-manager": {
      const submitter = await prisma.user.findUnique({
        where: { id: ctx.submittedById },
        select: { managerGuid: true },
      });
      if (!submitter?.managerGuid) return [];
      const manager = await prisma.user.findUnique({
        where: { objectGuid: submitter.managerGuid },
        select: { id: true, active: true },
      });
      return manager?.active ? [manager.id] : [];
    }

    case "dept-head": {
      if (!ctx.departmentId) return [];
      // Prefer DEPT_ADMIN users in the same department
      const admins = await prisma.user.findMany({
        where: { departmentId: ctx.departmentId, role: "DEPT_ADMIN", active: true },
        select: { id: true },
      });
      if (admins.length > 0) return admins.map((u) => u.id);
      // Fallback: SUPER_ADMIN
      const superAdmins = await prisma.user.findMany({
        where: { role: "SUPER_ADMIN", active: true },
        select: { id: true },
      });
      return superAdmins.map((u) => u.id);
    }

    case "designation": {
      const designation = config.assigneeValue as string | undefined;
      if (!designation) return [];
      const users = await prisma.user.findMany({
        where: {
          designation: { equals: designation, mode: "insensitive" },
          active: true,
          ...(ctx.departmentId ? { departmentId: ctx.departmentId } : {}),
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    case "app-role": {
      const role = config.assigneeValue as string | undefined;
      if (!role) return [];
      const users = await prisma.user.findMany({
        where: { role: role as never, active: true },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    case "ad-group": {
      const group = config.assigneeValue as string | undefined;
      if (!group) return [];
      const users = await prisma.user.findMany({
        where: { adGroups: { has: group }, active: true },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }

    case "dynamic-field": {
      const fieldKey = config.assigneeValue as string | undefined;
      if (!fieldKey) return [];
      const fieldValue = dataJson[fieldKey];
      if (typeof fieldValue === "string" && fieldValue) {
        const user = await prisma.user.findUnique({
          where: { id: fieldValue },
          select: { id: true, active: true },
        });
        return user?.active ? [user.id] : [];
      }
      return [];
    }

    default:
      return [];
  }
}

/**
 * Expand assignee IDs to include active delegates.
 * If user A has delegated to user B for today's date, B is added to the list.
 */
async function expandWithDelegates(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const now = new Date();
  const delegations = await prisma.delegation.findMany({
    where: {
      delegatorId: { in: userIds },
      active: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { delegatorId: true, delegateId: true },
  });

  const result = new Set(userIds);
  for (const d of delegations) {
    result.add(d.delegateId);
  }
  return Array.from(result);
}

/** Map AssigneeStrategy → Prisma AssigneeType enum value */
export function strategyToAssigneeType(
  strategy: ApprovalNodeConfig["assigneeStrategy"]
): string {
  const map: Record<string, string> = {
    "specific-users": "USER",
    "submitter-manager": "MANAGER_OF_SUBMITTER",
    "dept-head": "DEPT_HEAD",
    designation: "DESIGNATION",
    "app-role": "ROLE",
    "ad-group": "AD_GROUP",
    "dynamic-field": "DYNAMIC_FIELD",
  };
  return map[strategy] ?? "USER";
}
