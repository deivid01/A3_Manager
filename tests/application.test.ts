import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/appError";
import { calculateRentalMoneyTotals } from "../src/domain/money";
import { renderRentalDocumentHtml } from "../src/infrastructure/printing/rentalDocument";
import { createTestService, validCustomer, validEquipment } from "./helpers";

describe("serviços principais do A3 Manager", () => {
  it("semeia SYSTEM DEV com hash seguro e autentica corretamente", async () => {
    const { db, service } = await createTestService();
    const user = await service.login({ username: "system dev", password: "_int@383" });
    const stored = db.queryOne("SELECT password_hash FROM users WHERE id = ?", [user.id]);

    expect(user.username).toBe("SYSTEM DEV");
    expect(user.role).toBe("ADMIN");
    expect(String(stored?.password_hash)).toMatch(/^scrypt:/);
    expect(String(stored?.password_hash)).not.toContain("_int@383");
    await expect(service.login({ username: "SYSTEM DEV", password: "errada" })).rejects.toMatchObject({
      code: "AUTH_INVALID"
    });
  });

  it("cria cliente e equipamento com busca limitada para seletores", async () => {
    const { service } = await createTestService();
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);

    expect(customer.name).toBe("Maria Oliveira");
    expect(equipment.stockQuantity).toBe(5);
    expect(service.searchCustomers("")).toEqual([]);
    expect(service.searchEquipment("B")).toEqual([]);
    expect(service.searchCustomers("Ma")[0]?.id).toBe(customer.id);
    expect(service.searchEquipment("400L")[0]?.id).toBe(equipment.id);
  });

  it("lança locação transacional, baixa estoque e calcula indenização por item", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);

    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 2 }],
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "PIX",
        installments: null
      },
      user.id
    );

    expect(rental.returnDate).toBe("2026-09-14");
    expect(rental.items[0]?.unitRentalRateCents).toBe(28000);
    expect(rental.items[0]?.unitIndemnificationValueCents).toBe(20000);
    expect(
      service.listEquipment("Betoneira 400L").find((item) => item.id === equipment.id)
        ?.stockQuantity,
    ).toBe(3);
  });

  it("usa o preço do período como snapshot no item da locação", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment({ ...validEquipment, stockQuantity: 8 });
    const cases = [
      ["DAILY", 10000],
      ["WEEKLY", 15000],
      ["BIWEEKLY", 22000],
      ["MONTHLY", 28000],
    ] as const;

    for (const [period, expectedRate] of cases) {
      const rental = service.launchRental(
        {
          customerId: customer.id,
          period,
          startDate: "2026-08-14",
          items: [{ equipmentId: equipment.id, quantity: 1 }],
          deliveryStreet: "",
          deliveryNeighborhood: "",
          deliveryNumber: "",
          deliveryCep: "",
          deliveryCity: "",
          deliveryState: "",
          receiverIsCustomer: true,
          receiverName: "",
          receiverCpf: "",
          paymentMethod: "PIX",
          installments: null,
        },
        user.id,
      );

      expect(rental.items[0]?.unitRentalRateCents).toBe(expectedRate);
      expect(calculateRentalMoneyTotals(rental.items)).toEqual({
        rentalTotalCents: expectedRate,
      });
    }
  });

  it("calcula total de responsabilidade em locação com três equipamentos", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const betoneira = service.createEquipment({
      ...validEquipment,
      name: "Betoneira",
      dailyRateCents: 1000,
      weeklyRateCents: 2000,
      biweeklyRateCents: 3000,
      monthlyRateCents: 100000,
      unitIndemnificationValueCents: 20000,
      stockQuantity: 4
    });
    const martelete = service.createEquipment({
      ...validEquipment,
      name: "Martelete",
      dailyRateCents: 1000,
      weeklyRateCents: 2000,
      biweeklyRateCents: 3000,
      monthlyRateCents: 50000,
      unitIndemnificationValueCents: 10000,
      stockQuantity: 3
    });
    const andaime = service.createEquipment({
      ...validEquipment,
      name: "Andaime",
      dailyRateCents: 1000,
      weeklyRateCents: 2000,
      biweeklyRateCents: 3000,
      monthlyRateCents: 123456,
      unitIndemnificationValueCents: 7899,
      stockQuantity: 3
    });

    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: [
          { equipmentId: betoneira.id, quantity: 2 },
          { equipmentId: martelete.id, quantity: 1 },
          { equipmentId: andaime.id, quantity: 3 }
        ],
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "PIX",
        installments: null
      },
      user.id
    );

    expect(calculateRentalMoneyTotals(rental.items)).toEqual({
      rentalTotalCents: 620368
    });
  });

  it("não baixa estoque quando a locação falha por quantidade insuficiente", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment({ ...validEquipment, stockQuantity: 1 });

    expect(() =>
      service.launchRental(
        {
          customerId: customer.id,
          period: "MONTHLY",
          startDate: "2026-08-14",
          items: [{ equipmentId: equipment.id, quantity: 2 }],
          deliveryStreet: "",
          deliveryNeighborhood: "",
          deliveryNumber: "",
          deliveryCep: "",
          deliveryCity: "",
          deliveryState: "",
          receiverIsCustomer: true,
          receiverName: "",
          receiverCpf: "",
          paymentMethod: "PIX",
          installments: null
        },
        user.id
      )
    ).toThrow(AppError);
    expect(
      service.listEquipment("Betoneira 400L").find((item) => item.id === equipment.id)
        ?.stockQuantity,
    ).toBe(1);
    expect(service.listRentals({ page: 1, pageSize: 10 }).total).toBe(0);
  });

  it("finaliza locação restaurando estoque exatamente uma vez", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "WEEKLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 2 }],
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "CREDIT_CARD",
        installments: 3
      },
      user.id
    );

    const finalized = service.finalizeRental(rental.id);
    expect(finalized.status).toBe("FINALIZED");
    expect(
      service.listEquipment("Betoneira 400L").find((item) => item.id === equipment.id)
        ?.stockQuantity,
    ).toBe(5);
    expect(() => service.finalizeRental(rental.id)).toThrow(AppError);
    expect(
      service.listEquipment("Betoneira 400L").find((item) => item.id === equipment.id)
        ?.stockQuantity,
    ).toBe(5);
  });

  it("preserva snapshots históricos após edição dos cadastros", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 1 }],
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "BOLETO",
        installments: null
      },
      user.id
    );

    service.updateCustomer(customer.id, { ...validCustomer, name: "Nome Alterado" });
    service.updateEquipment(equipment.id, { ...validEquipment, unitIndemnificationValueCents: 99999 });
    service.saveCompany({
      legalName: "Outra Empresa",
      tradeName: "Outra",
      document: "00.000.000/0001-00",
      street: "Rua B",
      neighborhood: "Bairro",
      number: "2",
      cep: "01001-000",
      city: "São Paulo",
      state: "SP",
      contact: "Contato",
      email: ""
    });

    const detail = service.getRental(rental.id);
    expect(detail.customerSnapshot.name).toBe("Maria Oliveira");
    expect(detail.items[0]?.unitRentalRateCents).toBe(28000);
    expect(detail.items[0]?.unitIndemnificationValueCents).toBe(20000);
    expect(detail.companySnapshot.tradeName).toBe("A3 Locação");
  });

  it("preserva snapshot histórico do endereço de entrega após edição do cliente", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 1 }],
        deliveryStreet: customer.street,
        deliveryNeighborhood: customer.neighborhood,
        deliveryNumber: customer.number,
        deliveryCep: customer.cep,
        deliveryCity: customer.city,
        deliveryState: customer.state as "SP",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "PIX",
        installments: null
      },
      user.id
    );

    service.updateCustomer(customer.id, {
      ...validCustomer,
      street: "Rua Nova",
      number: "999",
      neighborhood: "Outro bairro"
    });

    const detail = service.getRental(rental.id);
    expect(detail.deliveryStreet).toBe("Rua Central");
    expect(detail.deliveryNumber).toBe("100");
    expect(detail.deliveryNeighborhood).toBe("Centro");
  });

  it("lança e finaliza locação grande mantendo transação e estoque corretos", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = Array.from({ length: 12 }, (_, index) =>
      service.createEquipment({
        ...validEquipment,
        name: `Equipamento grande ${String(index + 1).padStart(2, "0")}`,
        stockQuantity: 3
      })
    );

    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: equipment.map((item) => ({ equipmentId: item.id, quantity: 2 })),
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        receiverIsCustomer: true,
        receiverName: "",
        receiverCpf: "",
        paymentMethod: "PIX",
        installments: null
      },
      user.id
    );

    expect(rental.items).toHaveLength(12);
    expect(service.getRental(rental.id).items.reduce((sum, item) => sum + item.quantity, 0)).toBe(24);
    expect(service.listEquipment("Equipamento grande")[0]?.stockQuantity).toBe(1);

    const finalized = service.finalizeRental(rental.id);

    expect(finalized.status).toBe("FINALIZED");
    expect(service.listEquipment("Equipamento grande")).toHaveLength(12);
    expect(service.listEquipment("Equipamento grande").every((item) => item.stockQuantity === 3)).toBe(true);
  });

  it("pagina relatório com 10 registros iniciais sem duplicar", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment({ ...validEquipment, stockQuantity: 20 });

    for (let index = 0; index < 11; index += 1) {
      service.launchRental(
        {
          customerId: customer.id,
          period: "DAILY",
          startDate: "2026-08-14",
          items: [{ equipmentId: equipment.id, quantity: 1 }],
          deliveryStreet: "",
          deliveryNeighborhood: "",
          deliveryNumber: "",
          deliveryCep: "",
          deliveryCity: "",
          deliveryState: "",
          receiverIsCustomer: true,
          receiverName: "",
          receiverCpf: "",
          paymentMethod: "CASH",
          installments: null
        },
        user.id
      );
    }

    const firstPage = service.listRentals({ page: 1, pageSize: 10 });
    const secondPage = service.listRentals({ page: 2, pageSize: 10 });
    const filtered = service.listRentals({ page: 1, pageSize: 10, status: "ONGOING" });
    const ids = new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.id));
    expect(firstPage.rows).toHaveLength(10);
    expect(secondPage.rows).toHaveLength(1);
    expect(filtered.total).toBe(11);
    expect(ids.size).toBe(11);
  });

  it("gera HTML de contrato com dados esperados e sem navegação da aplicação", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 2 }],
        deliveryStreet: "Rua da Obra",
        deliveryNeighborhood: "",
        deliveryNumber: "50",
        deliveryCep: "",
        deliveryCity: "São Paulo",
        deliveryState: "SP",
        receiverIsCustomer: false,
        receiverName: "João Recebedor",
        receiverCpf: "529.982.247-25",
        paymentMethod: "PIX",
        installments: null
      },
      user.id
    );

    const html = renderRentalDocumentHtml(rental);
    expect(html).toContain(rental.code);
    expect(html).toContain("Maria Oliveira");
    expect(html).toContain("Betoneira 400L");
    expect(html).toContain("João Recebedor");
    expect(html).toContain("Total da locação");
    expect(html).toContain("Valor unitário da locação");
    expect(html).toContain("Subtotal da locação");
    expect(html).toContain("Indenização unitária");
    expect(html).toContain("TERMO DE RESPONSABILIDADE");
    expect(html).toContain("O LOCATÁRIO declara receber os equipamentos relacionados");
    expect(html).toContain("print-footer");
    expect(html).not.toContain("Valor total dos equipamentos");
    expect(html).not.toContain("Valor total da indenização");
    expect(html).not.toContain("Subtotal da indenização");
    expect(html).not.toContain("Nova locação");
  });
});
