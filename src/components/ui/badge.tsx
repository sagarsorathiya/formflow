import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
        secondary:   "border-transparent bg-slate-100 text-slate-600 dark:bg-muted/70 dark:text-slate-400",
        destructive: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
        outline:     "border-slate-200 text-slate-600 dark:border-border dark:text-slate-500",
        success:     "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
        warning:     "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
        violet:      "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
