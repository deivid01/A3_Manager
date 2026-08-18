import type { RentalPeriod } from "./types";

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
  unitRentalRateCents: number;
  unitIndemnificationValueCents: number;
}

export interface RentalItemMoneyTotals {
  itemSubtotalCents: number;
  indemnificationSubtotalCents: number;
  totalCents: number;
}

export interface RentalMoneyTotals {
  rentalTotalCents: number;
}

export interface EquipmentRentalRates {
  dailyRateCents: number;
  weeklyRateCents: number;
  biweeklyRateCents: number;
  monthlyRateCents: number;
}

export function getRentalRateForPeriod(
  rates: EquipmentRentalRates,
  period: RentalPeriod
): number {
  switch (period) {
    case "DAILY":
      return rates.dailyRateCents;
    case "WEEKLY":
      return rates.weeklyRateCents;
    case "BIWEEKLY":
      return rates.biweeklyRateCents;
    case "MONTHLY":
      return rates.monthlyRateCents;
    default:
      return exhaustivePeriod(period);
  }
}

export function calculateRentalItemSubtotal(
  quantity: number,
  unitRentalRateCents: number
): number {
  assertPositiveQuantity(quantity);
  assertMoneyCents(unitRentalRateCents, "O valor da locação deve ser informado em centavos.");

  return quantity * unitRentalRateCents;
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
  const itemSubtotalCents = calculateRentalItemSubtotal(
    item.quantity,
    item.unitRentalRateCents
  );
  const indemnificationSubtotalCents = calculateIndemnificationTotal(
    item.quantity,
    item.unitIndemnificationValueCents
  );

  return {
    itemSubtotalCents,
    indemnificationSubtotalCents,
    totalCents: itemSubtotalCents
  };
}

export function calculateRentalMoneyTotals(items: RentalMoneyItem[]): RentalMoneyTotals {
  return items.reduce<RentalMoneyTotals>(
    (totals, item) => {
      const itemTotals = calculateRentalItemTotals(item);
      return {
        rentalTotalCents: totals.rentalTotalCents + itemTotals.itemSubtotalCents
      };
    },
    {
      rentalTotalCents: 0
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

function exhaustivePeriod(value: never): never {
  throw new Error(`Período de locação inválido: ${String(value)}`);
}
