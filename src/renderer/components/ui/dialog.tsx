import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes
} from "react";
import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn("fixed inset-x-0 bottom-0 top-[38px] z-30 bg-[rgba(12,13,12,0.68)]", className)}
    ref={ref}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { wide?: boolean }
>(({ className, children, wide = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn(
        "fixed left-1/2 top-[calc(50%_+_19px)] z-40 grid max-h-[calc(100vh-82px)] w-[min(570px,calc(100vw-44px))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-white/35 bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] focus:outline-none",
        wide && "w-[min(880px,calc(100vw-44px))]",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex items-start justify-between gap-5 border-b border-[var(--border-subtle)] px-5 py-[18px]", className)}
    {...props}
  />
);

export const DialogBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 overflow-auto p-5", className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[#faf9f5] px-5 py-[13px]", className)}
    {...props}
  />
);

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogCloseButton({ onClick }: { onClick(): void }) {
  return (
    <button
      className="icon-button"
      type="button"
      title="Fechar"
      aria-label="Fechar"
      onClick={onClick}
    >
      <X size={18} />
    </button>
  );
}
