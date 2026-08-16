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
          "border border-[var(--button-primary-border)] bg-[var(--brand-primary)] text-[var(--brand-ink)] shadow-[var(--shadow-primary)] hover:-translate-y-px hover:bg-[var(--brand-primary-hover)]",
        secondary:
          "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--button-secondary-text)] hover:-translate-y-px hover:bg-[var(--button-secondary-hover)]",
        ghost:
          "border border-[var(--border-subtle)] bg-[var(--surface-primary)] text-[var(--text-primary)] hover:-translate-y-px hover:bg-[var(--surface-hover)]",
        danger:
          "border border-[var(--danger)] bg-[var(--danger)] text-white hover:-translate-y-px hover:bg-[var(--button-danger-hover)]",
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
