/**
 * Shared audience-matching logic — whether a published form is visible to a
 * given user, based on FormAudience (companies/departments/designations/adGroups).
 * Empty list on any dimension = no restriction on that dimension.
 *
 * Used by every surface that lists published forms to end users (Available
 * Forms, dashboard "Recently Added Forms", etc.) — any new surface listing
 * forms must filter through this, or it silently ignores audience targeting.
 */

import { prisma } from "@/lib/prisma";

export interface FormAudienceLike {
  companies: string[];
  departments: string[];
  designations: string[];
  adGroups: string[];
}

export interface AudienceUserContext {
  companyId: string | null;
  departmentId: string | null;
  designation: string | null;
  adGroups: string[];
  /** Company Head designations bypass department-restricted audiences within their own company. */
  isCompanyHead?: boolean;
  /** SUPER_ADMIN sees/uses every published form regardless of audience targeting. */
  role?: string;
}

/** Looks up whether a designation name is flagged as Company Head. */
export async function isCompanyHeadDesignation(designation: string | null): Promise<boolean> {
  if (!designation) return false;
  const record = await prisma.designation.findUnique({
    where: { name: designation },
    select: { isCompanyHead: true },
  });
  return record?.isCompanyHead ?? false;
}

export function isFormVisibleToUser(
  audience: FormAudienceLike | null | undefined,
  user: AudienceUserContext | null | undefined
): boolean {
  if (!audience) return true;
  if (user?.role === "SUPER_ADMIN") return true;

  const companyMatch =
    audience.companies.length === 0 ||
    (user?.companyId ? audience.companies.includes(user.companyId) : false);
  const deptMatch =
    user?.isCompanyHead ||
    audience.departments.length === 0 ||
    (user?.departmentId ? audience.departments.includes(user.departmentId) : false);
  const designationMatch =
    audience.designations.length === 0 ||
    (user?.designation
      ? audience.designations.some((d) => d.toLowerCase() === user.designation!.toLowerCase())
      : false);
  const adGroupMatch =
    audience.adGroups.length === 0 ||
    (user?.adGroups ? audience.adGroups.some((g) => user.adGroups.includes(g)) : false);

  const criteria: boolean[] = [];
  if (audience.companies.length > 0) criteria.push(companyMatch);
  if (audience.departments.length > 0) criteria.push(deptMatch);
  if (audience.designations.length > 0) criteria.push(designationMatch);
  if (audience.adGroups.length > 0) criteria.push(adGroupMatch);

  return criteria.length === 0 || criteria.every(Boolean);
}
