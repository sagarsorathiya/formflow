/**
 * Authorization helpers — all server-side, never trust client roles.
 * Every route handler/server action must call requireUser() or requireRole().
 */

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import type { Session } from "next-auth";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export async function requireUser(): Promise<Session["user"]> {
  const session = await getSession();
  if (!session?.user) {
    throw new AppError("UNAUTHENTICATED", 401, "You must be logged in.");
  }
  return session.user;
}

export async function requireRole(
  ...roles: string[]
): Promise<Session["user"]> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "You are not authorized to perform this action."
    );
  }
  return user;
}

export async function requireSuperAdmin(): Promise<Session["user"]> {
  return requireRole("SUPER_ADMIN");
}

export async function requireDeptAdminOrAbove(): Promise<Session["user"]> {
  return requireRole("SUPER_ADMIN", "DEPT_ADMIN");
}

// ─── Object-level checks ──────────────────────────────────────────────────────

import { prisma } from "./prisma";
import type { Form, WorkflowTask } from "@prisma/client";

/** Can this user create/edit/publish forms for the given department? */
export async function canManageForm(
  userId: string,
  userRole: string,
  form: Pick<Form, "departmentId" | "createdById">
): Promise<boolean> {
  if (userRole === "SUPER_ADMIN") return true;
  if (userRole === "DEPT_ADMIN") {
    // Must be admin of the form's department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return user?.departmentId === form.departmentId || form.createdById === userId;
  }
  return false;
}

/** Can this user act on (approve/reject/return) this workflow task? */
export function canActOnTask(
  userId: string,
  task: Pick<WorkflowTask, "resolvedAssigneeIds" | "status">
): boolean {
  if (task.status !== "PENDING") return false;
  return task.resolvedAssigneeIds.includes(userId);
}

/** Can this user view this submission? */
export async function canViewSubmission(
  userId: string,
  userRole: string,
  submissionId: string,
  userDepartmentId?: string | null
): Promise<boolean> {
  if (userRole === "SUPER_ADMIN") return true;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      submittedById: true,
      tasks: { select: { resolvedAssigneeIds: true } },
      formVersion: { select: { form: { select: { departmentId: true } } } },
    },
  });

  if (!submission) return false;
  if (submission.submittedById === userId) return true;

  // DEPT_ADMIN of the form's own department can view any submission to it
  if (
    userRole === "DEPT_ADMIN" &&
    userDepartmentId &&
    userDepartmentId === submission.formVersion.form.departmentId
  ) {
    return true;
  }

  // Approvers assigned to any task on this submission can view it
  return submission.tasks.some((t) => t.resolvedAssigneeIds.includes(userId));
}

// ─── API route error handler ──────────────────────────────────────────────────

export function apiError(
  err: unknown
): { status: number; body: { ok: false; error: { code: string; message: string } } } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { ok: false, error: { code: err.code, message: err.message } },
    };
  }
  console.error("[api] unexpected error:", err);
  return {
    status: 500,
    body: {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    },
  };
}
