import { describe, expect, it } from "vitest";
import {
  applyDeliveryAddress,
  buildInitialRentalForm,
  buildRentalLaunchForm,
  customerDeliveryAddress,
  isMeaningfulRentalDraft,
  updateManualDeliveryAddress,
  type RentalLaunchStoredDraft,
} from "../src/renderer/features/rentalLaunchState";
import type { CustomerSearchResult } from "../src/domain/types";

const customer: CustomerSearchResult = {
  id: "customer-1",
  name: "Maria Oliveira",
  cpf: "529.982.247-25",
  street: "Rua Central",
  neighborhood: "Centro",
  number: "100",
  cep: "01001-000",
  city: "São Paulo",
  state: "SP",
  contact: "(11) 99999-0000",
};

describe("estado da Nova Locação", () => {
  it("usa endereço do cliente quando a entrega está marcada como Sim", () => {
    const form = buildInitialRentalForm("request-1", "2026-08-16");

    const launchForm = buildRentalLaunchForm(form, customer);

    expect(launchForm.deliveryStreet).toBe("Rua Central");
    expect(launchForm.deliveryNumber).toBe("100");
    expect(launchForm.deliveryState).toBe("SP");
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
});
