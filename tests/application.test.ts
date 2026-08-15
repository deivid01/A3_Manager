import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/appError";
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
    expect(service.searchEquipment("Be")[0]?.id).toBe(equipment.id);
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
    expect(rental.items[0]?.unitIndemnificationValueCents).toBe(20000);
    expect(service.listEquipment("Betoneira")[0]?.stockQuantity).toBe(3);
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
    expect(service.listEquipment("Betoneira")[0]?.stockQuantity).toBe(1);
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
    expect(service.listEquipment("Betoneira")[0]?.stockQuantity).toBe(5);
    expect(() => service.finalizeRental(rental.id)).toThrow(AppError);
    expect(service.listEquipment("Betoneira")[0]?.stockQuantity).toBe(5);
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
    expect(detail.items[0]?.unitIndemnificationValueCents).toBe(20000);
    expect(detail.companySnapshot.tradeName).toBe("A3 Locação");
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
    expect(html).toContain("Termo de responsabilidade");
    expect(html).not.toContain("Nova locação");
  });
});
