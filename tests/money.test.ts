import { describe, expect, it } from "vitest";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  getRentalRateForPeriod
} from "../src/domain/money";

describe("calculo monetario da locacao", () => {
  it.each([
    {
      quantity: 1,
      unitRentalRateCents: 50000,
      unitIndemnificationValueCents: 10000,
      expectedItemCents: 50000,
      expectedIndemnificationCents: 10000
    },
    {
      quantity: 2,
      unitRentalRateCents: 100000,
      unitIndemnificationValueCents: 20000,
      expectedItemCents: 200000,
      expectedIndemnificationCents: 40000
    },
    {
      quantity: 3,
      unitRentalRateCents: 123456,
      unitIndemnificationValueCents: 7899,
      expectedItemCents: 370368,
      expectedIndemnificationCents: 23697
    }
  ])(
    "calcula subtotal por item em centavos para quantidade $quantity",
    ({
      quantity,
      unitRentalRateCents,
      unitIndemnificationValueCents,
      expectedItemCents,
      expectedIndemnificationCents
    }) => {
      expect(
        calculateRentalItemTotals({
          quantity,
          unitRentalRateCents,
          unitIndemnificationValueCents
        })
      ).toEqual({
        itemSubtotalCents: expectedItemCents,
        indemnificationSubtotalCents: expectedIndemnificationCents,
        totalCents: expectedItemCents
      });
    }
  );

  it("soma somente subtotais de locacao no total pagavel", () => {
    expect(
      calculateRentalMoneyTotals([
        { quantity: 1, unitRentalRateCents: 50000, unitIndemnificationValueCents: 10000 },
        { quantity: 2, unitRentalRateCents: 100000, unitIndemnificationValueCents: 20000 },
        { quantity: 3, unitRentalRateCents: 123456, unitIndemnificationValueCents: 7899 }
      ])
    ).toEqual({
      rentalTotalCents: 620368
    });
  });

  it("seleciona a taxa correta para cada periodo de locacao", () => {
    const rates = {
      dailyRateCents: 900,
      weeklyRateCents: 1000,
      biweeklyRateCents: 1100,
      monthlyRateCents: 1200
    };

    expect(getRentalRateForPeriod(rates, "DAILY")).toBe(900);
    expect(getRentalRateForPeriod(rates, "WEEKLY")).toBe(1000);
    expect(getRentalRateForPeriod(rates, "BIWEEKLY")).toBe(1100);
    expect(getRentalRateForPeriod(rates, "MONTHLY")).toBe(1200);
  });
});
