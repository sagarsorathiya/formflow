/**
 * LDAP authentication and user sync.
 * When DEV_MOCK_LDAP=true the real LDAP calls are skipped entirely and
 * mock users are returned — safe for local dev without an AD server.
 */

import { env } from "./env";
import { getRuntimeConfig } from "./runtime-config";

export interface LdapUser {
  objectGuid: string;
  samAccountName: string;
  displayName: string;
  email: string;
  designation: string | null;
  managerGuid: string | null;
  adGroups: string[];
  company: string | null;
  department: string | null;
  /** false when userAccountControl has ACCOUNTDISABLE bit set */
  active: boolean;
}

// ─── Mock users for DEV_MOCK_LDAP=true ───────────────────────────────────────

const MOCK_USERS: (LdapUser & { password: string })[] = [
  {
    objectGuid: "mock-guid-superadmin-001",
    samAccountName: "superadmin",
    displayName: "Super Admin",
    email: "superadmin@example.com",
    designation: "System Administrator",
    managerGuid: null,
    adGroups: ["FormFlow-SuperAdmins", "Domain Users"],
    company: "ACME",
    department: "IT",
    active: true,
    password: "Admin@123",
  },
  {
    objectGuid: "mock-guid-deptadmin-001",
    samAccountName: "itadmin",
    displayName: "IT Department Admin",
    email: "itadmin@example.com",
    designation: "IT Manager",
    managerGuid: "mock-guid-superadmin-001",
    adGroups: ["FormFlow-IT-Admins", "Domain Users"],
    company: "ACME",
    department: "IT",
    active: true,
    password: "Admin@123",
  },
  {
    objectGuid: "mock-guid-hradmin-001",
    samAccountName: "hradmin",
    displayName: "HR Department Admin",
    email: "hradmin@example.com",
    designation: "HR Manager",
    managerGuid: "mock-guid-superadmin-001",
    adGroups: ["FormFlow-HR-Admins", "Domain Users"],
    company: "GLBX",
    department: "HR",
    active: true,
    password: "Admin@123",
  },
  {
    objectGuid: "mock-guid-user-001",
    samAccountName: "jdoe",
    displayName: "John Doe",
    email: "jdoe@example.com",
    designation: "Officer",
    managerGuid: "mock-guid-deptadmin-001", // itadmin's actual objectGuid
    adGroups: ["Domain Users"],
    company: "ACME",
    department: "IT",
    active: true,
    password: "User@123",
  },
  {
    objectGuid: "mock-guid-user-002",
    samAccountName: "asmith",
    displayName: "Alice Smith",
    email: "asmith@example.com",
    designation: "Senior Officer",
    managerGuid: "mock-guid-hradmin-001",
    adGroups: ["Domain Users"],
    company: "GLBX",
    department: "HR",
    active: true,
    password: "User@123",
  },
  {
    objectGuid: "mock-guid-approver-001",
    samAccountName: "manager1",
    displayName: "Bob Manager",
    email: "manager1@example.com",
    designation: "General Manager",
    managerGuid: "mock-guid-deptadmin-001", // itadmin's actual objectGuid
    adGroups: ["Domain Users", "Managers"],
    company: "ACME",
    department: "IT",
    active: true,
    password: "Admin@123",
  },
];

// ─── Mock auth ────────────────────────────────────────────────────────────────

export async function mockAuthenticate(
  username: string,
  password: string
): Promise<LdapUser | null> {
  // Strip DOMAIN\ prefix if supplied
  const sam = username.includes("\\") ? username.split("\\")[1] : username;
  const user = MOCK_USERS.find(
    (u) => u.samAccountName.toLowerCase() === sam.toLowerCase()
  );
  if (!user || user.password !== password || !user.active) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...ldapUser } = user;
  return ldapUser;
}

export function getMockUsers(): LdapUser[] {
  return MOCK_USERS.map(({ password: _pw, ...u }) => u);
}

// ─── Real LDAP auth ────────────────────────────────────────────────────────────

export async function ldapAuthenticate(
  username: string,
  password: string
): Promise<LdapUser | null> {
  // Config resolves from SystemSetting (admin UI) with .env as fallback.
  const cfg = await getRuntimeConfig();
  if (!cfg.ldapUrl || !cfg.ldapBaseDn || !cfg.ldapBindDn || !cfg.ldapBindPassword) {
    throw new Error("LDAP is not configured — set it in Admin → Settings or .env");
  }

  const { Client } = await import("ldapts");

  const sam = username.includes("\\") ? username.split("\\")[1] : username;

  const client = new Client({
    url: cfg.ldapUrl,
    tlsOptions: cfg.ldapUrl.startsWith("ldaps://")
      ? {}
      : cfg.ldapAllowInsecure
        ? undefined
        : { rejectUnauthorized: true },
  });

  try {
    // Step 1: service account bind to search for the user DN
    await client.bind(cfg.ldapBindDn, cfg.ldapBindPassword);

    // Escape user input to prevent LDAP injection
    const escapedSam = escapeLdapFilter(sam);
    const { searchEntries } = await client.search(cfg.ldapBaseDn, {
      scope: "sub",
      filter: `(|(sAMAccountName=${escapedSam})(userPrincipalName=${escapedSam}@*))`,
      attributes: [
        "objectGUID",
        "sAMAccountName",
        "displayName",
        "mail",
        "title",
        "manager",
        "memberOf",
        "company",
        "department",
        "userAccountControl",
        "distinguishedName",
      ],
      explicitBufferAttributes: ["objectGUID"],
    });

    if (searchEntries.length === 0) return null;

    const entry = searchEntries[0];
    const dn = entry.dn;

    // Step 2: bind as the found user to verify password
    await client.bind(dn, password);

    // Parse userAccountControl — bit 2 (0x2) = ACCOUNTDISABLE
    const uac = Number(entry["userAccountControl"] ?? 0);
    const active = (uac & 0x2) === 0;

    if (!active) return null;

    // Parse AD groups from memberOf
    const memberOf = normalizeStringArray(entry["memberOf"]);
    const adGroups = memberOf.map((dn) => parseCNFromDN(dn)).filter(Boolean) as string[];

    return {
      objectGuid: parseObjectGuid(entry["objectGUID"]),
      samAccountName: String(entry["sAMAccountName"] ?? sam),
      displayName: String(entry["displayName"] ?? sam),
      email: String(entry["mail"] ?? ""),
      designation: entry["title"] ? String(entry["title"]) : null,
      managerGuid: entry["manager"]
        ? await resolveManagerGuid(client, String(entry["manager"]), cfg.ldapBaseDn)
        : null,
      adGroups,
      company: entry["company"] ? String(entry["company"]) : extractCompanyFromDN(dn),
      department: entry["department"] ? String(entry["department"]) : null,
      active,
    };
  } catch (err) {
    // Distinguish "bad credentials" from "server error"
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("Invalid Credentials") ||
      message.includes("49") // LDAP error 49 = invalidCredentials
    ) {
      return null;
    }
    throw err;
  } finally {
    await client.unbind().catch(() => {});
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeLdapFilter(value: string): string {
  return value
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

function parseCNFromDN(dn: string): string | null {
  const match = dn.match(/^CN=([^,]+)/i);
  return match ? match[1] : null;
}

function extractCompanyFromDN(dn: string): string | null {
  // Try to derive company from OU=CompanyName in DN
  const match = dn.match(/OU=([^,]+)/i);
  return match ? match[1] : null;
}

function parseObjectGuid(raw: unknown): string {
  if (Buffer.isBuffer(raw)) {
    return raw.toString("hex");
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw).toString("hex");
  }
  return String(raw ?? "");
}

function normalizeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

async function resolveManagerGuid(
  client: InstanceType<typeof import("ldapts").Client>,
  managerDn: string,
  baseDn: string
): Promise<string | null> {
  try {
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub",
      filter: `(distinguishedName=${escapeLdapFilter(managerDn)})`,
      attributes: ["objectGUID"],
      explicitBufferAttributes: ["objectGUID"],
    });
    if (searchEntries.length === 0) return null;
    return parseObjectGuid(searchEntries[0]["objectGUID"]);
  } catch {
    return null;
  }
}

// ─── Nightly sync helpers ─────────────────────────────────────────────────────

export async function ldapSearchAllUsers(baseDn?: string): Promise<LdapUser[]> {
  if (env.DEV_MOCK_LDAP) return getMockUsers();

  const cfg = await getRuntimeConfig();
  if (!cfg.ldapUrl || !cfg.ldapBaseDn || !cfg.ldapBindDn || !cfg.ldapBindPassword) {
    throw new Error("LDAP is not configured — set it in Admin → Settings or .env");
  }

  const { Client } = await import("ldapts");
  const client = new Client({ url: cfg.ldapUrl });

  try {
    await client.bind(cfg.ldapBindDn, cfg.ldapBindPassword);
    const searchBase = baseDn ?? cfg.ldapBaseDn;

    const { searchEntries } = await client.search(searchBase, {
      scope: "sub",
      filter: "(&(objectClass=user)(objectCategory=person))",
      attributes: [
        "objectGUID",
        "sAMAccountName",
        "displayName",
        "mail",
        "title",
        "manager",
        "memberOf",
        "company",
        "department",
        "userAccountControl",
      ],
      paged: true,
      explicitBufferAttributes: ["objectGUID"],
    });

    return searchEntries.map((entry) => {
      const uac = Number(entry["userAccountControl"] ?? 0);
      const memberOf = normalizeStringArray(entry["memberOf"]);
      return {
        objectGuid: parseObjectGuid(entry["objectGUID"]),
        samAccountName: String(entry["sAMAccountName"] ?? ""),
        displayName: String(entry["displayName"] ?? ""),
        email: String(entry["mail"] ?? ""),
        designation: entry["title"] ? String(entry["title"]) : null,
        managerGuid: entry["manager"] ? String(entry["manager"]) : null,
        adGroups: memberOf.map((d) => parseCNFromDN(d)).filter(Boolean) as string[],
        company: entry["company"] ? String(entry["company"]) : null,
        department: entry["department"] ? String(entry["department"]) : null,
        active: (uac & 0x2) === 0,
      };
    });
  } finally {
    await client.unbind().catch(() => {});
  }
}
