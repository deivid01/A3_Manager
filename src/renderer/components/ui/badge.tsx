import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-6 items-center rounded-[5px] border px-2 py-[3px] text-[10px] font-bold",
  {
    variants: {
      variant: {
        success: "border-[#cce4db] bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-[#efdcae] bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "border-[#efc9c5] bg-[var(--danger-soft)] text-[var(--danger)]",
        neutral: "border-[#dde0da] bg-[#eef0ed] text-[var(--text-secondary)]"
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
