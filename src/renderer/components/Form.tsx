import { Search, X } from "lucide-react";
import {
  useEffect,
  type ButtonHTMLAttributes,
  type ChangeEventHandler,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { BRAZILIAN_STATES } from "../../domain/types";

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
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      <span className="field-control">
        {leadingIcon && <span className="field-leading">{leadingIcon}</span>}
        <input
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
    </label>
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
    <label className="field">
      <span className="field-label">{label}</span>
      <select {...props}>{children}</select>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
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
    <button
      className={`app-button ${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="loading-spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`icon-button ${className}`} {...props}>
      {children}
    </button>
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
    <section className={`section-card ${className}`}>
      {(title || action) && (
        <header className="section-card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({
  kind,
  children,
}: {
  kind: "success" | "warning" | "danger" | "neutral";
  children: ReactNode;
}) {
  return <span className={`status-badge ${kind}`}>{children}</span>;
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`modal ${wide ? "wide" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={18} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
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
      <p className="confirm-copy">
        Essa ação mantém o histórico existente, mas remove o registro das
        seleções ativas.
      </p>
    </Modal>
  );
}
