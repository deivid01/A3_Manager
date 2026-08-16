import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center rounded-[5px] border px-2 py-[3px] text-[10px] font-bold",
  {
    variants: {
      variant: {
        success: "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
        neutral: "border-[var(--neutral-border)] bg-[var(--neutral-soft)] text-[var(--text-secondary)]"
      }
    },
    defaultVariants: {
      variant: "neutral"
    }
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
