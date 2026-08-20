import { describe, expect, it } from "vitest";
import {
  applyDeliveryAddress,
  buildSelectedRentalItem,
  buildInitialRentalForm,
  buildRentalLaunchForm,
  customerDeliveryAddress,
  isMeaningfulRentalDraft,
  recalculateSelectedRentalItemsForPeriod,
  updateManualDeliveryAddress,
  type RentalLaunchStoredDraft,
} from "../src/renderer/features/rentalLaunchState";
import type { CustomerSearchResult, EquipmentSearchResult } from "../src/domain/types";

const customer: CustomerSearchResult = {
  id: "customer-1",
  customerType: "PF",
  name: "Maria Oliveira",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  street: "Rua Central",
  neighborhood: "Centro",
  number: "100",
  cep: "01001-000",
  city: "São Paulo",
  state: "SP",
  contact: "(11) 99999-0000",
};

const equipment: EquipmentSearchResult = {
  id: "equipment-1",
  name: "Betoneira 400L",
  stockQuantity: 5,
  dailyRateCents: 10000,
  weeklyRateCents: 15000,
  biweeklyRateCents: 22000,
  monthlyRateCents: 28000,
  unitIndemnificationValueCents: 20000,
};

describe("estado da Nova Locação", () => {
  it("usa endereço do cliente quando a entrega está marcada como Sim", () => {
    const form = buildInitialRentalForm("request-1", "2026-08-16");

    const launchForm = buildRentalLaunchForm(form, customer);

    expect(launchForm.deliveryStreet).toBe("Rua Central");
    expect(launchForm.deliveryNumber).toBe("100");
    expect(launchForm.deliveryState).toBe("SP");
    expect(launchForm).not.toHaveProperty("receiverIsCustomer");
    expect(launchForm).not.toHaveProperty("receiverName");
    expect(launchForm).not.toHaveProperty("receiverCpf");
  });

  it("preserva endereço manual ao alternar entre Não e Sim", () => {
    const initial = buildInitialRentalForm("request-1", "2026-08-16");
    const manual = updateManualDeliveryAddress(
      { ...initial, deliveryMatchesCustomer: false },
      {
        deliveryStreet: "Rua da Obra",
        deliveryNumber: "50",
        deliveryCity: "São Paulo",
        deliveryState: "SP",
      },
    );
    const customerAddress = applyDeliveryAddress(
      { ...manual, deliveryMatchesCustomer: true },
      customerDeliveryAddress(customer),
    );
    const restoredManual = applyDeliveryAddress(
      { ...customerAddress, deliveryMatchesCustomer: false },
      customerAddress.manualDeliveryAddress,
    );

    expect(restoredManual.deliveryStreet).toBe("Rua da Obra");
    expect(restoredManual.deliveryNumber).toBe("50");
    expect(restoredManual.deliveryCity).toBe("São Paulo");
  });

  it("considera rascunho de locação significativo sem confiar em valores derivados", () => {
    const draft: RentalLaunchStoredDraft = {
      form: buildInitialRentalForm("request-1", "2026-08-16"),
      customer,
      items: [],
    };

    expect(isMeaningfulRentalDraft(draft, "2026-08-16")).toBe(true);
  });

  it("recalcula o valor unitário da locação ao trocar o período", () => {
    const selected = buildSelectedRentalItem(equipment, "DAILY");

    const [weekly] = recalculateSelectedRentalItemsForPeriod([selected], "WEEKLY");
    const [monthly] = recalculateSelectedRentalItemsForPeriod([selected], "MONTHLY");

    expect(selected.unitRentalRateCents).toBe(10000);
    expect(weekly?.unitRentalRateCents).toBe(15000);
    expect(monthly?.unitRentalRateCents).toBe(28000);
    expect(monthly?.unitIndemnificationValueCents).toBe(20000);
  });
});
