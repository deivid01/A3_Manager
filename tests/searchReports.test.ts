import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestService, validCustomer, validEquipment } from "./helpers";

describe("busca e relatórios", () => {
  it("rejeita CPF duplicado de cliente", async () => {
    const { service } = await createTestService();
    service.createCustomer(validCustomer);

    expect(() => service.createCustomer({ ...validCustomer, name: "Outra Pessoa" })).toThrow();
  });

  it("combina filtros de relatório no banco com paginação limitada", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment({ ...validEquipment, stockQuantity: 8 });
    const launch = (startDate: string) =>
      service.launchRental(
        {
          customerId: customer.id,
          period: "DAILY",
          startDate,
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
          installments: null,
          clientRequestId: randomUUID()
        },
        user.id
      );

    const first = launch("2026-08-14");
    launch("2026-08-15");
    service.finalizeRental(first.id);

    const filtered = service.listRentals({
      page: 1,
      pageSize: 10,
      status: "FINALIZED",
      customerName: "maria",
      startDate: "2026-08-14",
      endDate: "2026-08-14"
    });

    expect(filtered.total).toBe(1);
    expect(filtered.rows[0]?.status).toBe("FINALIZED");
    expect(filtered.rows[0]?.customerName).toBe("Maria Oliveira");
  });

  it("arquiva e desarquiva locação sem alterar estoque ou status", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment({ ...validEquipment, stockQuantity: 5 });
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "DAILY",
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
        paymentMethod: "CASH",
        installments: null,
        clientRequestId: randomUUID(),
      },
      user.id,
    );

    const archived = service.archiveRental(rental.id, user.id);
    const stockAfterArchive = service.listEquipment("Betoneira 400L")
      .find((item) => item.id === equipment.id)?.stockQuantity;

    expect(archived.status).toBe("ONGOING");
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedByUserId).toBe(user.id);
    expect(stockAfterArchive).toBe(3);
    expect(service.listRentals({ page: 1, pageSize: 10 }).total).toBe(0);
    expect(service.listRentals({ page: 1, pageSize: 10, archiveStatus: "ARCHIVED" }).total).toBe(1);
    expect(service.listRentals({ page: 1, pageSize: 10, archiveStatus: "ALL" }).total).toBe(1);

    const unarchived = service.unarchiveRental(rental.id);

    expect(unarchived.archivedAt).toBeNull();
    expect(unarchived.status).toBe("ONGOING");
    expect(service.listRentals({ page: 1, pageSize: 10 }).total).toBe(1);
    expect(service.listRentals({ page: 1, pageSize: 10, archiveStatus: "ARCHIVED" }).total).toBe(0);
  });
});
