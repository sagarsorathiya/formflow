/**
 * BullMQ queue and worker definitions.
 * All queue names are centralised here so app and worker stay in sync.
 */

import { Queue } from "bullmq";
import { env } from "./env";

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || "6379"),
};

// ─── Queue instances (used by web app to enqueue jobs) ────────────────────────

export const workflowQueue = new Queue("workflow", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

export const emailQueue = new Queue("email", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export const adSyncQueue = new Queue("ad-sync", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

export const pdfQueue = new Queue("pdf", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export const slaQueue = new Queue("sla", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

export const reconcileQueue = new Queue("reconcile", {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});

// ─── Job payload types ────────────────────────────────────────────────────────

export interface WorkflowAdvanceJob {
  submissionId: string;
  stepKey?: string; // if undefined, advances from current state
}

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export interface AdSyncJob {
  type: "full" | "user";
  objectGuid?: string;
}

export interface PdfJob {
  submissionId: string;
}

export interface SlaCheckJob {
  taskId: string;
  reminderCount: number;
  slaDays: number;
  escalateAfterReminders?: number;
}

// ─── Helpers to enqueue ───────────────────────────────────────────────────────

export async function enqueueWorkflowAdvance(
  submissionId: string,
  stepKey?: string
): Promise<void> {
  // BullMQ v5+ forbids colons in custom job IDs — use underscore as separator
  const jobId = `advance_${submissionId}_${stepKey ?? "current"}`;
  await workflowQueue.add(
    "advance",
    { submissionId, stepKey } satisfies WorkflowAdvanceJob,
    { jobId, delay: 0 }
  );
}

export async function enqueueEmail(payload: EmailJob): Promise<void> {
  await emailQueue.add("send", payload);
}

export async function enqueuePdf(submissionId: string): Promise<void> {
  const jobId = `pdf_${submissionId}`;
  // BullMQ silently ignores add() while a job with this id is still kept in the
  // failed/completed set — a failed PDF would never be retried and a regenerate
  // after edit would be a no-op. Clear a finished job first; leave an active or
  // waiting one alone (that one will produce the PDF).
  const existing = await pdfQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed" || state === "completed") await existing.remove();
  }
  await pdfQueue.add("generate", { submissionId } satisfies PdfJob, { jobId });
}

export async function enqueueSlaCheck(
  taskId: string,
  dueAt: Date,
  slaDays: number,
  escalateAfterReminders?: number
): Promise<void> {
  const delay = Math.max(0, dueAt.getTime() - Date.now());
  const jobId = `sla_${taskId}_0`;
  await slaQueue.add(
    "check",
    { taskId, reminderCount: 0, slaDays, escalateAfterReminders } satisfies SlaCheckJob,
    { jobId, delay }
  );
}

export function getQueueConnection() {
  return connection;
}

/**
 * Upserts the repeatable reconciliation job. BullMQ dedupes repeatable jobs by
 * name+jobId+repeat options, so calling this on every worker boot is a no-op
 * if it's already scheduled.
 */
export async function scheduleStuckSubmissionReconciliation(): Promise<void> {
  await reconcileQueue.add(
    "reconcile-stuck",
    {},
    { jobId: "reconcile-stuck-repeat", repeat: { every: 10 * 60 * 1000 } }
  );
}
