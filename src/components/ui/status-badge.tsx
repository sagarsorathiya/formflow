import { Badge } from "@/components/ui/badge";
import { getStatusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  return (
    <Badge variant={meta.variant} className={cn("gap-1.5", className)}>
      <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", meta.dot)} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
