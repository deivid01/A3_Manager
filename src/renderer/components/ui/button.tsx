import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border border-[#df980b] bg-[var(--brand-primary)] text-[var(--brand-ink)] shadow-[0_6px_14px_rgba(216,143,0,0.18)] hover:-translate-y-px hover:bg-[var(--brand-primary-hover)] hover:text-white",
        secondary:
          "border border-[#2a2c2a] bg-[#2a2c2a] text-white hover:-translate-y-px hover:bg-[#3a3d3a]",
        ghost:
          "border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-primary)] hover:-translate-y-px hover:bg-[var(--surface-hover)]",
        danger:
          "border border-[var(--danger)] bg-[var(--danger)] text-white hover:-translate-y-px hover:bg-[#972f2a]",
        icon:
          "border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:-translate-y-px hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      },
      size: {
        default: "min-h-[42px] px-[15px]",
        sm: "min-h-9 px-3",
        icon: "h-9 w-9 p-0"
      }
    },
    defaultVariants: {
      variant: "secondary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
