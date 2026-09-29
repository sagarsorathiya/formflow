/**
 * Upsert a user record from LDAP data, applying role mappings.
 * Called on every successful login and during the nightly AD sync job.
 *
 * Company / department / designation are NOT synced from LDAP — the user
 * selects these during onboarding and can change them in Settings.
 * This function only updates identity fields and preserves existing org data.
 */

import { prisma } from "./prisma";
import type { LdapUser } from "./ldap";
import type { User, UserRole } from "@prisma/client";

export async function upsertUserFromLdap(ldapUser: LdapUser): Promise<User> {
  return prisma.$transaction(async (tx) => {
    // Determine role from AD group → RoleMapping table
    const role = await resolveRoleFromAdGroups(tx, ldapUser.adGroups);

    // Fall back to samAccountName match for users whose objectGuid was computed
    // by the pre-fix lossy LDAP binary parser — this self-heals
    // their stored objectGuid to the correct value on next login.
    const existing =
      (await tx.user.findUnique({ where: { objectGuid: ldapUser.objectGuid } })) ??
      (await tx.user.findUnique({ where: { samAccountName: ldapUser.samAccountName } }));

    if (existing) {
      // Update identity fields only — do NOT overwrite org assignment fields
      // (companyId, departmentId, designation) since the user sets those via onboarding/settings.
      return tx.user.update({
        where: { id: existing.id },
        data: {
          objectGuid: ldapUser.objectGuid,
          samAccountName: ldapUser.samAccountName,
          displayName: ldapUser.displayName,
          email: ldapUser.email,
          managerGuid: ldapUser.managerGuid ?? null,
          adGroups: ldapUser.adGroups,
          active: ldapUser.active,
          role: role ?? existing.role, // don't downgrade manually-set role
          lastLoginAt: new Date(),
        },
      });
    }

    // New user — create without org assignment (profileComplete stays false)
    return tx.user.create({
      data: {
        objectGuid: ldapUser.objectGuid,
        samAccountName: ldapUser.samAccountName,
        displayName: ldapUser.displayName,
        email: ldapUser.email,
        managerGuid: ldapUser.managerGuid ?? null,
        adGroups: ldapUser.adGroups,
        active: ldapUser.active,
        role: role ?? "USER",
        profileComplete: false,
        lastLoginAt: new Date(),
      },
    });
  });
}

async function resolveRoleFromAdGroups(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  adGroups: string[]
): Promise<UserRole | null> {
  if (adGroups.length === 0) return null;
  const allMappings = await tx.roleMapping.findMany({
    where: { adGroup: { in: adGroups } },
  });
  if (allMappings.length === 0) return null;
  const roleOrder: UserRole[] = ["USER", "DEPT_ADMIN", "SUPER_ADMIN"];
  let highest: UserRole = "USER";
  for (const m of allMappings) {
    if (roleOrder.indexOf(m.appRole) > roleOrder.indexOf(highest)) {
      highest = m.appRole;
    }
  }
  return highest;
}
