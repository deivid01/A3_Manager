export function parseMoneyToCents(value: string): number {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Informe um valor monetário válido.");
  }

  return Math.round(amount * 100);
}

export function formatCents(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value / 100);
}

export function calculateIndemnificationTotal(
  quantity: number,
  unitIndemnificationValueCents: number
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("A quantidade deve ser um inteiro positivo.");
  }

  if (!Number.isInteger(unitIndemnificationValueCents) || unitIndemnificationValueCents < 0) {
    throw new Error("O valor de indenização deve ser informado em centavos.");
  }

  return quantity * unitIndemnificationValueCents;
}
