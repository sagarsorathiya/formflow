import { NextRequest, NextResponse } from "next/server";
import { requireUser, apiError, AppError } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/queues";
import { writeNotification } from "@/lib/notifications";

const GRACE_PERIOD_MS = 15 * 60 * 1000;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const isSuperAdmin = user.role === "SUPER_ADMIN";

    const submission = await prisma.submission.findUnique({
      where: { id: params.id },
      include: {
        formVersion: { include: { form: { select: { title: true } } } },
        submittedBy: { select: { id: true, email: true, displayName: true } },
        tasks: {
          select: { id: true, status: true, resolvedAssigneeIds: true },
        },
      },
    });

    if (!submission) throw new AppError("NOT_FOUND", 404, "Submission not found.");

    // Regular users can only cancel their own; SUPER_ADMIN can cancel any
    if (!isSuperAdmin && submission.submittedById !== user.id) {
      throw new AppError("FORBIDDEN", 403, "You can only cancel your own requests.");
    }

    if (["REJECTED", "CANCELLED"].includes(submission.status)) {
      throw new AppError(
        "INVALID_STATUS",
        400,
        `This request is already ${submission.status.toLowerCase()} and cannot be cancelled.`
      );
    }

    // APPROVED submissions: only SUPER_ADMIN can cancel
    if (submission.status === "APPROVED" && !isSuperAdmin) {
      throw new AppError(
        "INVALID_STATUS",
        400,
        "This request has already been approved and cannot be cancelled."
      );
    }

    // Grace period: regular users only
    if (!isSuperAdmin) {
      const ageMs = Date.now() - submission.createdAt.getTime();
      if (ageMs > GRACE_PERIOD_MS) {
        throw new AppError(
          "GRACE_EXPIRED",
          400,
          "The 15-minute cancellation window has passed. Contact your department admin if you need to withdraw this request."
        );
      }

      const hasApproverActed = submission.tasks.some((t) =>
        ["APPROVED", "REJECTED", "RETURNED"].includes(t.status)
      );
      if (hasApproverActed) {
        throw new AppError(
          "APPROVER_ACTED",
          400,
          "An approver has already acted on this request. It can no longer be cancelled."
        );
      }
    }

    const formTitle = submission.formVersion.form.title;
    const serialNo = submission.serialNo ?? "";

    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: params.id },
        data: { status: "CANCELLED", completedAt: new Date() },
      });

      await tx.workflowTask.updateMany({
        where: { submissionId: params.id, status: "PENDING" },
        data: { status: "SKIPPED" },
      });

      await writeAudit({
        actorId: user.id,
        action: "SUBMISSION_CANCELLED",
        entityType: "Submission",
        entityId: params.id,
        after: { status: "CANCELLED", cancelledBy: user.id, role: user.role },
        tx,
      });
    });

    // Notify pending assignees
    const pendingTasks = submission.tasks.filter((t) => t.status === "PENDING");
    const assigneeIds = pendingTasks.flatMap((t) => t.resolvedAssigneeIds);
    if (assigneeIds.length > 0) {
      const assignees = await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, email: true, displayName: true },
      });
      for (const a of assignees) {
        if (a.email) {
          await enqueueEmail({
            to: a.email,
            subject: `Withdrawn: ${formTitle} — ${serialNo}`,
            html: `<p>Hi ${a.displayName ?? ""},</p><p>The request <strong>${serialNo}</strong> for <strong>${formTitle}</strong> has been withdrawn${isSuperAdmin ? " by an administrator" : " by the submitter"}. No action is required from you.</p>`,
          }).catch(console.error);
        }
      }
    }

    // Notify the submitter if a SUPER_ADMIN cancelled on their behalf
    if (isSuperAdmin && submission.submittedById !== user.id) {
      if (submission.submittedBy.email) {
        await enqueueEmail({
          to: submission.submittedBy.email,
          subject: `Request cancelled by admin: ${formTitle} — ${serialNo}`,
          html: `<p>Hi ${submission.submittedBy.displayName ?? ""},</p><p>Your request <strong>${serialNo}</strong> for <strong>${formTitle}</strong> has been cancelled by an administrator. Please contact your department admin for further information.</p>`,
        }).catch(console.error);
      }
      await writeNotification(submission.submittedById, "SUBMISSION_CANCELLED", {
        submissionId: params.id,
        serialNo: serialNo || undefined,
        formTitle,
      }).catch(console.error);
    } else {
      await writeNotification(user.id, "SUBMISSION_CANCELLED", {
        submissionId: params.id,
        serialNo: serialNo || undefined,
        formTitle,
      }).catch(console.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
