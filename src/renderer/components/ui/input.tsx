import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "min-h-11 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-primary)] px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition duration-150 placeholder:text-[#989e98] hover:border-[#aeb2aa] focus:border-[var(--brand-primary-hover)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] aria-[invalid=true]:border-[var(--danger)]",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";
