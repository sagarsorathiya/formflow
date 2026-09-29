import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageForm } from "@/lib/authz";
import dynamic from "next/dynamic";
import { StatusBadge } from "@/components/ui/status-badge";
import { SkeletonForm } from "@/components/ui/skeleton";
import { EMPTY_SCHEMA, EMPTY_WORKFLOW } from "@/lib/types/schema";
import type { FormSchema, WorkflowDefinition } from "@/lib/types/schema";
import type { Metadata } from "next";

const BuilderShell = dynamic(
  () => import("@/components/builder/builder-shell").then((m) => m.BuilderShell),
  { ssr: false, loading: () => <div className="p-8"><SkeletonForm /></div> }
);

interface Props {
  params: { formId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const form = await prisma.form.findUnique({
    where: { id: params.formId },
    select: { title: true },
  });
  return { title: form ? `Builder — ${form.title}` : "Form Builder" };
}

export default async function BuilderPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "USER") redirect("/dashboard");

  const form = await prisma.form.findUnique({
    where: { id: params.formId },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
      department: { select: { id: true, name: true } },
    },
  });

  if (!form) notFound();

  const allowed = await canManageForm(session.user.id, session.user.role, form);
  if (!allowed) redirect("/builder");

  const latestVersion = form.versions[0];
  const schema = (latestVersion?.schemaJson as FormSchema | null) ?? EMPTY_SCHEMA;
  const workflowJson = (latestVersion?.workflowJson as WorkflowDefinition | null) ?? EMPTY_WORKFLOW;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-[#0b1120]">
      {/* Portal nav reused for consistent UX */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 h-14 dark:bg-[#0f1628] dark:border-white/8">
        <div className="flex items-center h-full px-4 gap-3">
          <a href="/builder" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-slate-900 dark:text-white text-sm">FormFlow</span>
          </a>
          <span className="text-slate-300 dark:text-white/20">›</span>
          <a href="/builder" className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition">
            Builder
          </a>
          <span className="text-slate-300 dark:text-white/20">›</span>
          <span className="text-sm text-slate-900 dark:text-white font-medium truncate max-w-[300px]">
            {form.title}
          </span>
          {form.status !== "DRAFT" && (
            <StatusBadge status={form.status} />
          )}
        </div>
      </header>

      <BuilderShell
        formId={form.id}
        initialTitle={form.title}
        initialDescription={form.description}
        initialDepartmentId={form.departmentId}
        initialRules={{
          anonymous: form.anonymous,
          oneTimeOnly: form.oneTimeOnly,
          confidential: form.confidential,
        }}
        initialDepartmentName={form.department?.name ?? null}
        initialStatus={form.status}
        initialSchema={schema}
        initialWorkflowJson={workflowJson as unknown as Record<string, unknown>}
      />
    </div>
  );
}
