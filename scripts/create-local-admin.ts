/**
 * Creates or updates a local-password SUPER_ADMIN account that bypasses LDAP.
 * Emergency/bootstrap access only (deliberate exception to LDAP-only auth)
 * as a deliberate exception to the LDAP-only auth design.
 *
 * Usage: tsx --env-file .env scripts/create-local-admin.ts <samAccountName> <password>
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: tsx --env-file .env scripts/create-local-admin.ts <samAccountName> <password>");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { samAccountName: username },
    create: {
      objectGuid: `local-${username}`,
      samAccountName: username,
      displayName: `${username} (local admin)`,
      email: `${username}@local.formflow`,
      role: "SUPER_ADMIN",
      active: true,
      profileComplete: true,
      passwordHash,
    },
    update: {
      passwordHash,
      role: "SUPER_ADMIN",
      active: true,
    },
  });

  console.log(`Local admin ready: ${user.samAccountName} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
