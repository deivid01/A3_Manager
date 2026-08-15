import type { RentalPeriod } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Informe uma data válida no formato AAAA-MM-DD.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Informe uma data de calendário válida.");
  }
}

export function calculateReturnDate(startDate: string, period: RentalPeriod): string {
  assertIsoDate(startDate);

  switch (period) {
    case "DAILY":
      return addDays(startDate, 1);
    case "WEEKLY":
      return addDays(startDate, 7);
    case "BIWEEKLY":
      return addDays(startDate, 15);
    case "MONTHLY":
      return addMonths(startDate, 1);
    case "QUARTERLY":
      return addMonths(startDate, 3);
    case "SEMIANNUAL":
      return addMonths(startDate, 6);
    case "ANNUAL":
      return addMonths(startDate, 12);
    default:
      return exhaustivePeriod(period);
  }
}

function addDays(startDate: string, days: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) + days * dayMs);
  return toIsoDate(date);
}

function addMonths(startDate: string, monthsToAdd: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return toIsoDate(new Date(Date.UTC(targetYear, normalizedMonthIndex, targetDay)));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function exhaustivePeriod(value: never): never {
  throw new Error(`Período de locação inválido: ${String(value)}`);
}
