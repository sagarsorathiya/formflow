import { prisma } from "@/lib/prisma";
import { toUrlSlug } from "@/lib/utils";

/**
 * Turns a form title into a URL slug that is unique across all forms, appending
 * `-2`, `-3`, ... on collision. Shared by form creation and duplication so both
 * produce slugs the same way — `Form.slug` is `@unique`, and a collision here
 * surfaces as a raw Prisma P2002 rather than anything a user can act on.
 */
export async function generateUniqueSlug(title: string): Promise<string> {
  const base = toUrlSlug(title) || "form";
  let candidate = base;
  let suffix = 2;
  while (await prisma.form.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}
