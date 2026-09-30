import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { env } from "./env";
import { ldapAuthenticate, ldapLookupUser, mockAuthenticate, mockLookupUser } from "./ldap";
import type { LdapUser } from "./ldap";
import { consumeSsoTicket, isSsoEnabled } from "./sso";
import { upsertUserFromLdap } from "./user-sync";
import { writeAudit } from "./audit";
import { prisma } from "./prisma";

// ─── NextAuth configuration ────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60,  // slide session every 1 hour of activity
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "ldap",
      name: "Domain Account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) return null;

        const ip =
          (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
          "unknown";

        // ── Rate-limit check ──────────────────────────────────────────────
        const lockKey = `login:lock:${credentials.username.toLowerCase()}:${ip}`;
        const attemptsKey = `login:attempts:${credentials.username.toLowerCase()}:${ip}`;

        try {
          const { default: Redis } = await import("ioredis");
          const redis = new Redis(env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
          await redis.connect().catch(() => null);

          const locked = await redis.get(lockKey).catch(() => null);
          if (locked) {
            await redis.quit().catch(() => null);
            return null; // silently deny — NextAuth will show generic error
          }

          // ── Local-account bypass (emergency/bootstrap admin access only) ──
          // Exception to the LDAP-only auth design.
          // Only ever matches users with a passwordHash set; normal LDAP users have none.
          const localUser = await prisma.user.findUnique({
            where: { samAccountName: credentials.username },
          });
          if (localUser?.passwordHash) {
            const valid = await bcrypt.compare(credentials.password, localUser.passwordHash);
            if (!valid) {
              const attempts = await redis.incr(attemptsKey).catch(() => 0);
              await redis.expire(attemptsKey, 15 * 60).catch(() => null);
              if (attempts >= 5) await redis.setex(lockKey, 15 * 60, "1").catch(() => null);
              await redis.quit().catch(() => null);
              return null;
            }
            await redis.del(attemptsKey, lockKey).catch(() => null);
            await redis.quit().catch(() => null);

            await prisma.user.update({
              where: { id: localUser.id },
              data: { lastLoginAt: new Date() },
            });
            await writeAudit({
              actorId: localUser.id,
              action: "USER_LOGIN",
              entityType: "User",
              entityId: localUser.id,
              ip,
              after: { samAccountName: localUser.samAccountName, method: "local-password" },
            });

            return {
              id: localUser.id,
              name: localUser.displayName,
              email: localUser.email,
              role: localUser.role,
              companyId: localUser.companyId,
              departmentId: localUser.departmentId,
              designation: localUser.designation,
              profileComplete: localUser.profileComplete,
            };
          }

          let ldapUser: LdapUser | null = null;

          if (env.DEV_MOCK_LDAP) {
            ldapUser = await mockAuthenticate(credentials.username, credentials.password);
          } else {
            ldapUser = await ldapAuthenticate(credentials.username, credentials.password);
          }

          if (!ldapUser) {
            // Increment failed attempt counter
            const attempts = await redis.incr(attemptsKey).catch(() => 0);
            await redis.expire(attemptsKey, 15 * 60).catch(() => null);
            if (attempts >= 5) {
              await redis.setex(lockKey, 15 * 60, "1").catch(() => null);
            }
            await redis.quit().catch(() => null);
            return null;
          }

          // Clear failed attempts on success
          await redis.del(attemptsKey, lockKey).catch(() => null);
          await redis.quit().catch(() => null);

          // Upsert user in local DB, apply role mappings
          const dbUser = await upsertUserFromLdap(ldapUser);

          await writeAudit({
            actorId: dbUser.id,
            action: "USER_LOGIN",
            entityType: "User",
            entityId: dbUser.id,
            ip,
            after: { samAccountName: dbUser.samAccountName },
          });

          return {
            id: dbUser.id,
            name: dbUser.displayName,
            email: dbUser.email,
            role: dbUser.role,
            companyId: dbUser.companyId,
            departmentId: dbUser.departmentId,
            designation: dbUser.designation,
            profileComplete: dbUser.profileComplete,
          };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),

    // Windows Integrated SSO. Redeems the single-use ticket minted by
    // /api/sso/ticket (via the IIS ASP.NET bridge) after IIS authenticated the browser. There is no
    // password here, so the ticket is the only thing that proves anything —
    // see src/lib/sso.ts.
    CredentialsProvider({
      id: "sso",
      name: "Windows SSO",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      async authorize(credentials, req) {
        if (!isSsoEnabled() || !credentials?.ticket) return null;

        const ip =
          (req.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
          "unknown";

        try {
          const sam = await consumeSsoTicket(credentials.ticket);
          if (!sam) return null;

          // A local-password account (the bootstrap superadmin) must never be
          // reachable by a domain account that merely shares its name:
          // upsertUserFromLdap falls back to matching on samAccountName and
          // would overwrite that row's identity with the domain user's.
          const local = await prisma.user.findUnique({ where: { samAccountName: sam } });
          if (local?.passwordHash) return null;

          const ldapUser = env.DEV_MOCK_LDAP ? mockLookupUser(sam) : await ldapLookupUser(sam);
          if (!ldapUser) return null; // not in AD, ambiguous, or disabled

          const dbUser = await upsertUserFromLdap(ldapUser);

          await writeAudit({
            actorId: dbUser.id,
            action: "USER_LOGIN",
            entityType: "User",
            entityId: dbUser.id,
            ip,
            after: { samAccountName: dbUser.samAccountName, method: "windows-sso" },
          });

          return {
            id: dbUser.id,
            name: dbUser.displayName,
            email: dbUser.email,
            role: dbUser.role,
            companyId: dbUser.companyId,
            departmentId: dbUser.departmentId,
            designation: dbUser.designation,
            profileComplete: dbUser.profileComplete,
          };
        } catch (err) {
          console.error("[auth] sso authorize error:", err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Allow client-side session.update() to refresh specific fields
      if (trigger === "update" && session) {
        if (typeof session.profileComplete === "boolean") {
          token.profileComplete = session.profileComplete;
        }
        if (session.companyId !== undefined) token.companyId = session.companyId;
        if (session.departmentId !== undefined) token.departmentId = session.departmentId;
        if (session.designation !== undefined) token.designation = session.designation;
      }
      if (user) {
        // Initial sign-in: persist app fields into JWT
        token.userId = user.id;
        token.role = (user as AppUser).role;
        token.companyId = (user as AppUser).companyId;
        token.departmentId = (user as AppUser).departmentId;
        token.designation = (user as AppUser).designation;
        token.profileComplete = (user as AppUser).profileComplete;
      }
      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string | null;
        session.user.departmentId = token.departmentId as string | null;
        session.user.designation = token.designation as string | null;
        session.user.profileComplete = (token.profileComplete as boolean | undefined) ?? false;
      }
      return session;
    },
  },
};

// ─── Type augmentation ────────────────────────────────────────────────────────

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string | null;
  departmentId: string | null;
  designation: string | null;
  profileComplete: boolean;
}

// Augment next-auth types so TypeScript knows about our extra fields
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      companyId: string | null;
      departmentId: string | null;
      designation: string | null;
      profileComplete: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: string;
    companyId?: string | null;
    departmentId?: string | null;
    designation?: string | null;
    profileComplete?: boolean;
  }
}
