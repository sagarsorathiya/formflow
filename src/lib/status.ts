import type { BadgeProps } from "@/components/ui/badge";

type StatusVariant = BadgeProps["variant"];

interface StatusMeta {
  label: string;
  variant: StatusVariant;
  dot: string;
}

export const STATUS_CONFIG: Record<string, StatusMeta> = {
  PENDING:     { label: "Pending",     variant: "warning",     dot: "bg-status-pending" },
  IN_PROGRESS: { label: "In Progress", variant: "default",     dot: "bg-status-inProgress" },
  APPROVED:    { label: "Approved",    variant: "success",     dot: "bg-status-approved" },
  REJECTED:    { label: "Rejected",    variant: "destructive", dot: "bg-status-rejected" },
  RETURNED:    { label: "Returned",    variant: "violet",      dot: "bg-status-returned" },
  CANCELLED:   { label: "Cancelled",   variant: "secondary",   dot: "bg-status-cancelled" },
  DRAFT:       { label: "Draft",       variant: "outline",     dot: "bg-status-draft" },
} as const;

export function getStatusMeta(status: string): StatusMeta {
  return STATUS_CONFIG[status] ?? { label: status, variant: "outline", dot: "bg-slate-400" };
}
