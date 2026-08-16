import { Search } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ChangeEventHandler,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { BRAZILIAN_STATES } from "../../domain/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  leadingIcon?: ReactNode;
  trailingAction?: ReactNode;
}

export function Field({
  label,
  error,
  hint,
  leadingIcon,
  trailingAction,
  className = "",
  ...props
}: FieldProps) {
  return (
    <Label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      <span className="field-control">
        {leadingIcon && <span className="field-leading">{leadingIcon}</span>}
        <Input
          className={leadingIcon ? "has-leading" : ""}
          aria-invalid={Boolean(error)}
          {...props}
        />
        {trailingAction && (
          <span className="field-trailing">{trailingAction}</span>
        )}
      </span>
      {error ? (
        <small className="field-error">{error}</small>
      ) : (
        hint && <small className="field-hint">{hint}</small>
      )}
    </Label>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function SelectField({
  label,
  children,
  hint,
  ...props
}: SelectFieldProps) {
  return (
    <Label className="field">
      <span className="field-label">{label}</span>
      <select {...props}>{children}</select>
      {hint && <small className="field-hint">{hint}</small>}
    </Label>
  );
}

export function UfSelect({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  allowEmpty?: boolean;
}) {
  return (
    <SelectField label="UF" value={value} onChange={onChange}>
      {allowEmpty && <option value="">Não informado</option>}
      {BRAZILIAN_STATES.map((state) => (
        <option key={state} value={state}>
          {state}
        </option>
      ))}
    </SelectField>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
}

export function AppButton({
  variant = "secondary",
  icon,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: AppButtonProps) {
  return (
    <Button
      className={`app-button ${variant} ${className}`}
      disabled={disabled || loading}
      variant={variant}
      {...props}
    >
      {loading ? <span className="loading-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </Button>
  );
}

export function IconButton({
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button className={`icon-button ${className}`} size="icon" variant="icon" {...props}>
      {children}
    </Button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  onSearch,
}: {
  value: string;
  onChange(value: string): void;
  placeholder: string;
  onSearch?(): void;
}) {
  return (
    <label className="search-field">
      <Search size={18} aria-hidden="true" />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onSearch?.()}
      />
    </label>
  );
}

export function Message({
  kind,
  children,
}: {
  kind: "success" | "error" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={`message ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}

export function SectionCard({
  title,
  description,
  action,
  className = "",
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`section-card ${className}`}>
      {(title || action) && (
        <CardHeader className="section-card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </CardHeader>
      )}
      <CardContent className="contents">{children}</CardContent>
    </Card>
  );
}

export function StatusBadge({
  kind,
  children,
}: {
  kind: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  return <Badge className={`status-badge ${kind}`} variant={kind}>{children}</Badge>;
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  className = "",
}: {
  title: string;
  description?: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`modal ${wide ? "wide" : ""} ${className}`}
        wide={wide}
        aria-label={title}
      >
        <DialogHeader className="modal-header">
          <div>
            <DialogTitle asChild><h2>{title}</h2></DialogTitle>
            {description && <DialogDescription asChild><p>{description}</p></DialogDescription>}
          </div>
          <DialogCloseButton onClick={onClose} />
        </DialogHeader>
        <DialogBody className="modal-body">{children}</DialogBody>
        {footer && <DialogFooter className="modal-footer">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  children?: ReactNode;
  onConfirm(): void;
  onClose(): void;
}) {
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </AppButton>
          <AppButton type="button" variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </AppButton>
        </>
      }
    >
      {children ?? (
        <p className="confirm-copy">
          Essa ação mantém o histórico existente, mas remove o registro das
          seleções ativas.
        </p>
      )}
    </Modal>
  );
}
