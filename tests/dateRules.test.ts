import { describe, expect, it } from "vitest";
import { calculateReturnDate } from "../src/domain/dateRules";

describe("regras de data de locação", () => {
  it("calcula a devolução mensal de 14/08/2026 para 14/09/2026", () => {
    expect(calculateReturnDate("2026-08-14", "MONTHLY")).toBe("2026-09-14");
  });

  it("trata fim de mês de forma determinística", () => {
    expect(calculateReturnDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(calculateReturnDate("2024-01-31", "MONTHLY")).toBe("2024-02-29");
  });

  it("aplica períodos em dias sem conversão de fuso", () => {
    expect(calculateReturnDate("2026-08-14", "DAILY")).toBe("2026-08-15");
    expect(calculateReturnDate("2026-08-14", "WEEKLY")).toBe("2026-08-21");
    expect(calculateReturnDate("2026-08-14", "BIWEEKLY")).toBe("2026-08-29");
  });

  it("calcula períodos longos definidos pelo domínio", () => {
    expect(calculateReturnDate("2026-08-14", "QUARTERLY")).toBe("2026-11-14");
    expect(calculateReturnDate("2026-08-14", "SEMIANNUAL")).toBe("2027-02-14");
    expect(calculateReturnDate("2026-08-14", "ANNUAL")).toBe("2027-08-14");
  });

  it("trata ano bissexto em período anual com semântica de fim de mês", () => {
    expect(calculateReturnDate("2024-02-29", "ANNUAL")).toBe("2025-02-28");
  });
});
