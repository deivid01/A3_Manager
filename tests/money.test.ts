import { describe, expect, it } from "vitest";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals
} from "../src/domain/money";

describe("cálculo monetário de responsabilidade da locação", () => {
  it.each([
    {
      quantity: 1,
      equipmentValueCents: 50000,
      unitIndemnificationValueCents: 10000,
      expectedEquipmentCents: 50000,
      expectedIndemnificationCents: 10000,
      expectedTotalCents: 60000
    },
    {
      quantity: 2,
      equipmentValueCents: 100000,
      unitIndemnificationValueCents: 20000,
      expectedEquipmentCents: 200000,
      expectedIndemnificationCents: 40000,
      expectedTotalCents: 240000
    },
    {
      quantity: 3,
      equipmentValueCents: 123456,
      unitIndemnificationValueCents: 7899,
      expectedEquipmentCents: 370368,
      expectedIndemnificationCents: 23697,
      expectedTotalCents: 394065
    }
  ])(
    "calcula subtotais por item em centavos para quantidade $quantity",
    ({
      quantity,
      equipmentValueCents,
      unitIndemnificationValueCents,
      expectedEquipmentCents,
      expectedIndemnificationCents,
      expectedTotalCents
    }) => {
      expect(
        calculateRentalItemTotals({
          quantity,
          equipmentValueCents,
          unitIndemnificationValueCents
        })
      ).toEqual({
        equipmentSubtotalCents: expectedEquipmentCents,
        indemnificationSubtotalCents: expectedIndemnificationCents,
        totalCents: expectedTotalCents
      });
    }
  );

  it("soma totais independentes de equipamento, indenização e total geral", () => {
    expect(
      calculateRentalMoneyTotals([
        { quantity: 1, equipmentValueCents: 50000, unitIndemnificationValueCents: 10000 },
        { quantity: 2, equipmentValueCents: 100000, unitIndemnificationValueCents: 20000 },
        { quantity: 3, equipmentValueCents: 123456, unitIndemnificationValueCents: 7899 }
      ])
    ).toEqual({
      equipmentTotalCents: 620368,
      indemnificationTotalCents: 73697,
      grandTotalCents: 694065
    });
  });
});
