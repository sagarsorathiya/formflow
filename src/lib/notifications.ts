import { prisma } from "./prisma";

export type NotificationType =
  | "TASK_ASSIGNED"
  | "SUBMISSION_APPROVED"
  | "SUBMISSION_REJECTED"
  | "SUBMISSION_RETURNED"
  | "SUBMISSION_CANCELLED"
  | "SLA_REMINDER"
  | "SLA_ESCALATED"
  | "SUBMISSION_RESUBMITTED";

export interface NotificationPayload {
  submissionId?: string;
  taskId?: string;
  serialNo?: string;
  formTitle?: string;
  stepKey?: string;
  stepLabel?: string;
  comment?: string;
  actorName?: string;
  message?: string;
}

export async function writeNotification(
  userId: string,
  type: NotificationType,
  payload: NotificationPayload,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<void> {
  const client = tx ?? prisma;
  await (client as typeof prisma).notification.create({
    data: { userId, type, payloadJson: payload as object },
  });
}

export async function writeNotificationForMany(
  userIds: string[],
  type: NotificationType,
  payload: NotificationPayload
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, payloadJson: payload as object })),
  });
}
