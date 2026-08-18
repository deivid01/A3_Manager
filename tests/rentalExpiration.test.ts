import { describe, expect, it } from "vitest";
import { getRentalExpirationAlert } from "../src/domain/rentalExpiration";
import type { RentalPeriod, RentalStatus } from "../src/domain/types";

describe("alertas de vencimento de locação", () => {
  it("mostra vencimento hoje para diária na data de devolução", () => {
    expect(alert("DAILY", "ONGOING", "2026-08-18", "2026-08-18")).toMatchObject({
      state: "today",
      label: "Vence hoje",
      remainingDays: 0,
    });
  });

  it("respeita janela semanal de 1 dia", () => {
    expect(alert("WEEKLY", "ONGOING", "2026-08-20", "2026-08-18").state).toBe("none");
    expect(alert("WEEKLY", "ONGOING", "2026-08-19", "2026-08-18")).toMatchObject({
      state: "warning",
      label: "Vence amanhã",
      remainingDays: 1,
    });
  });

  it("respeita janela quinzenal de 3 dias", () => {
    expect(alert("BIWEEKLY", "ONGOING", "2026-08-22", "2026-08-18").state).toBe("none");
    expect(alert("BIWEEKLY", "ONGOING", "2026-08-21", "2026-08-18")).toMatchObject({
      state: "warning",
      label: "Vence em 3 dias",
      remainingDays: 3,
    });
    expect(alert("BIWEEKLY", "ONGOING", "2026-08-18", "2026-08-18")).toMatchObject({
      state: "today",
      label: "Vence hoje",
      remainingDays: 0,
    });
  });

  it("respeita janela mensal de 5 dias", () => {
    expect(alert("MONTHLY", "ONGOING", "2026-08-24", "2026-08-18").state).toBe("none");
    expect(alert("MONTHLY", "ONGOING", "2026-08-23", "2026-08-18")).toMatchObject({
      state: "warning",
      label: "Vence em 5 dias",
      remainingDays: 5,
    });
  });

  it("mostra atraso com singular e plural", () => {
    expect(alert("MONTHLY", "ONGOING", "2026-08-17", "2026-08-18")).toMatchObject({
      state: "overdue",
      label: "Atrasada há 1 dia",
      remainingDays: -1,
    });
    expect(alert("MONTHLY", "ONGOING", "2026-08-15", "2026-08-18")).toMatchObject({
      state: "overdue",
      label: "Atrasada há 3 dias",
      remainingDays: -3,
    });
  });

  it("não mostra alerta para locação finalizada", () => {
    expect(alert("DAILY", "FINALIZED", "2026-08-18", "2026-08-18")).toMatchObject({
      state: "none",
      label: "",
    });
    expect(alert("MONTHLY", "FINALIZED", "2026-08-10", "2026-08-18")).toMatchObject({
      state: "none",
      label: "",
    });
  });

  it("compara datas de calendário sem diferença por horário local", () => {
    expect(alert("WEEKLY", "ONGOING", "2026-08-19", "2026-08-18")).toMatchObject({
      label: "Vence amanhã",
      remainingDays: 1,
    });
    expect(alert("WEEKLY", "ONGOING", "2026-08-18", "2026-08-19")).toMatchObject({
      label: "Atrasada há 1 dia",
      remainingDays: -1,
    });
  });
});

function alert(
  period: RentalPeriod,
  status: RentalStatus,
  returnDate: string,
  today: string,
) {
  return getRentalExpirationAlert({ period, status, returnDate }, today);
}
