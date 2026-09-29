import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().url(),

  LDAP_URL: z.string().url().optional(),
  LDAP_BASE_DN: z.string().optional(),
  LDAP_BIND_DN: z.string().optional(),
  LDAP_BIND_PASSWORD: z.string().optional(),
  LDAP_ALLOW_INSECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(25),
  SMTP_FROM: z.string().default("FormFlow Portal <formflow@localhost>"),

  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),

  DEV_MOCK_LDAP: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

// Singleton — parsed once at startup, throws if invalid
export const env = parseEnv();
