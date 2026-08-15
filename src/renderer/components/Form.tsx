import type { ChangeEventHandler, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { BRAZILIAN_STATES } from "../../domain/types";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Field({ label, error, ...props }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function SelectField({ label, children, ...props }: SelectFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

export function UfSelect({
  value,
  onChange,
  allowEmpty = false
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

export function Message({ kind, children }: { kind: "success" | "error" | "info"; children: ReactNode }) {
  return <div className={`message ${kind}`}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
