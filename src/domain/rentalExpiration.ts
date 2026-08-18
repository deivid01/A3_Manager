import { assertIsoDate } from "./dateRules";
import type { RentalPeriod, RentalStatus } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export type RentalExpirationState = "warning" | "today" | "overdue" | "none";

export interface RentalExpirationAlert {
  state: RentalExpirationState;
  label: string;
  remainingDays: number;
}

export interface RentalExpirationInput {
  status: RentalStatus;
  period: RentalPeriod;
  returnDate: string;
}

const noExpirationAlert: RentalExpirationAlert = {
  state: "none",
  label: "",
  remainingDays: Number.POSITIVE_INFINITY,
};

const advanceDaysByPeriod: Record<RentalPeriod, number> = {
  DAILY: 0,
  WEEKLY: 1,
  BIWEEKLY: 3,
  MONTHLY: 5,
};

export function getRentalExpirationAlert(
  rental: RentalExpirationInput,
  todayIsoDate = currentLocalIsoDate(),
): RentalExpirationAlert {
  if (rental.status === "FINALIZED") {
    return noExpirationAlert;
  }

  const remainingDays = calendarDayDifference(todayIsoDate, rental.returnDate);
  if (remainingDays < 0) {
    const overdueDays = Math.abs(remainingDays);
    return {
      state: "overdue",
      label: `Atrasada h\u00e1 ${overdueDays} dia${overdueDays === 1 ? "" : "s"}`,
      remainingDays,
    };
  }

  if (remainingDays > advanceDaysByPeriod[rental.period]) {
    return noExpirationAlert;
  }

  if (remainingDays === 0) {
    return {
      state: "today",
      label: "Vence hoje",
      remainingDays,
    };
  }

  if (remainingDays === 1) {
    return {
      state: "warning",
      label: "Vence amanh\u00e3",
      remainingDays,
    };
  }

  return {
    state: "warning",
    label: `Vence em ${remainingDays} dias`,
    remainingDays,
  };
}

function calendarDayDifference(fromIsoDate: string, toIsoDate: string): number {
  assertIsoDate(fromIsoDate);
  assertIsoDate(toIsoDate);
  return (dateOnlyTime(toIsoDate) - dateOnlyTime(fromIsoDate)) / dayMs;
}

function dateOnlyTime(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function currentLocalIsoDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
