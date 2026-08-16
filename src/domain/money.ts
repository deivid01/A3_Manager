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

export interface RentalMoneyItem {
  quantity: number;
  equipmentValueCents: number;
  unitIndemnificationValueCents: number;
}

export interface RentalItemMoneyTotals {
  equipmentSubtotalCents: number;
  indemnificationSubtotalCents: number;
  totalCents: number;
}

export interface RentalMoneyTotals {
  equipmentTotalCents: number;
  indemnificationTotalCents: number;
  grandTotalCents: number;
}

export function calculateEquipmentSubtotal(
  quantity: number,
  equipmentValueCents: number
): number {
  assertPositiveQuantity(quantity);
  assertMoneyCents(equipmentValueCents, "O valor do equipamento deve ser informado em centavos.");

  return quantity * equipmentValueCents;
}

export function calculateIndemnificationTotal(
  quantity: number,
  unitIndemnificationValueCents: number
): number {
  assertPositiveQuantity(quantity);
  assertMoneyCents(unitIndemnificationValueCents, "O valor de indenização deve ser informado em centavos.");

  return quantity * unitIndemnificationValueCents;
}

export function calculateRentalItemTotals(item: RentalMoneyItem): RentalItemMoneyTotals {
  const equipmentSubtotalCents = calculateEquipmentSubtotal(
    item.quantity,
    item.equipmentValueCents
  );
  const indemnificationSubtotalCents = calculateIndemnificationTotal(
    item.quantity,
    item.unitIndemnificationValueCents
  );

  return {
    equipmentSubtotalCents,
    indemnificationSubtotalCents,
    totalCents: equipmentSubtotalCents + indemnificationSubtotalCents
  };
}

export function calculateRentalMoneyTotals(items: RentalMoneyItem[]): RentalMoneyTotals {
  return items.reduce<RentalMoneyTotals>(
    (totals, item) => {
      const itemTotals = calculateRentalItemTotals(item);
      return {
        equipmentTotalCents: totals.equipmentTotalCents + itemTotals.equipmentSubtotalCents,
        indemnificationTotalCents:
          totals.indemnificationTotalCents + itemTotals.indemnificationSubtotalCents,
        grandTotalCents: totals.grandTotalCents + itemTotals.totalCents
      };
    },
    {
      equipmentTotalCents: 0,
      indemnificationTotalCents: 0,
      grandTotalCents: 0
    }
  );
}

function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("A quantidade deve ser um inteiro positivo.");
  }
}

function assertMoneyCents(value: number, message: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }
}
