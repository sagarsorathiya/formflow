import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FillFormClient } from "./fill-form-client";
import type { FormSchema } from "@/lib/types/schema";
import { isFormVisibleToUser, isCompanyHeadDesignation } from "@/lib/audience";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

interface Props {
  params: { slug: string };
}

async function getForm(slug: string) {
  // Try slug first, fall back to ID for backward compatibility
  return (
    (await prisma.form.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: {
        department: { select: { name: true } },
        audience: true,
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })) ??
    (await prisma.form.findFirst({
      where: { id: slug, status: "PUBLISHED" },
      include: {
        department: { select: { name: true } },
        audience: true,
        versions: {
          where: { publishedAt: { not: null } },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const form = await getForm(params.slug);
  return { title: form ? `Fill — ${form.title}` : "Fill Form" };
}

export default async function FillFormPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [form, dbUser] = await Promise.all([
    getForm(params.slug),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        displayName: true,
        designation: true,
        companyId: true,
        departmentId: true,
        adGroups: true,
        company: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
  ]);

  if (!form || form.versions.length === 0) notFound();
  const isCompanyHead = await isCompanyHeadDesignation(dbUser?.designation ?? null);
  const audienceContext = dbUser ? { ...dbUser, isCompanyHead, role: session.user.role } : null;
  if (!isFormVisibleToUser(form.audience, audienceContext)) notFound();

  const version = form.versions[0];
  const schema = version.schemaJson as unknown as FormSchema;

  // One-time-only: show a clear "already submitted" panel rather than letting the
  // user fill the whole form and hit a 409 at the end. POST /api/submissions
  // enforces the same rule authoritatively.
  if (form.oneTimeOnly) {
    const priorSubmission = await prisma.submission.findFirst({
      where: {
        submittedById: session.user.id,
        status: { notIn: ["DRAFT", "CANCELLED"] },
        formVersion: { formId: form.id },
      },
      select: { id: true, serialNo: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (priorSubmission) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="rounded-2xl border border-black/8 bg-white p-8 text-center shadow-card
                          dark:bg-card dark:border-border dark:shadow-none">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 dark:bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">You have already submitted this form</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {form.title} accepts one submission per person.
            </p>
            <p className="mt-4 inline-block rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm text-slate-700
                          dark:bg-muted/60 dark:text-slate-300">
              {priorSubmission.serialNo ?? "Draft"}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/requests/${priorSubmission.id}`}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                View my submission
              </Link>
              <Link href="/forms"
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100
                           dark:text-slate-400 dark:hover:bg-muted/60">
                Back to forms
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  const draftSubmission = await prisma.submission.findFirst({
    where: {
      formVersionId: version.id,
      submittedById: session.user.id,
      status: "DRAFT",
    },
    orderBy: { createdAt: "desc" },
    include: { files: { select: { id: true, originalName: true, mime: true, size: true } } },
  });

  const initialFileMeta = Object.fromEntries(
    (draftSubmission?.files ?? []).map((f) => [f.id, { id: f.id, originalName: f.originalName, mime: f.mime, size: f.size }])
  );

  return (
    <FillFormClient
      formId={form.id}
      formTitle={form.title}
      formDescription={form.description}
      versionId={version.id}
      schema={schema}
      draftSubmissionId={draftSubmission?.id ?? null}
      initialData={(draftSubmission?.dataJson as Record<string, unknown>) ?? {}}
      initialFileMeta={initialFileMeta}
      user={{
        id: session.user.id,
        name: dbUser?.displayName ?? session.user.name ?? "",
        company: dbUser?.company?.name ?? "",
        department: dbUser?.department?.name ?? "",
        designation: dbUser?.designation ?? session.user.designation ?? "",
      }}
    />
  );
}
