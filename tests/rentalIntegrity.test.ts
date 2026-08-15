import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import { migrations } from "../src/infrastructure/database/schema";
import type { RentalLaunchInput } from "../src/shared/contracts";
import { validCustomer, validEquipment, createTestService } from "./helpers";

describe("integridade transacional de locações", () => {
  it("mantém lançamento idempotente para a mesma requisição do cliente", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const input: RentalLaunchInput = {
      customerId: customer.id,
      period: "MONTHLY" as const,
      startDate: "2026-08-14",
      items: [{ equipmentId: equipment.id, quantity: 2 }],
      deliveryStreet: "",
      deliveryNeighborhood: "",
      deliveryNumber: "",
      deliveryCep: "",
      deliveryCity: "",
      deliveryState: "",
      receiverIsCustomer: true,
      receiverName: "Não deve persistir",
      receiverCpf: "529.982.247-25",
      paymentMethod: "PIX" as const,
      installments: 5,
      clientRequestId: randomUUID()
    };

    const first = service.launchRental(input, user.id);
    const second = service.launchRental(input, user.id);

    expect(second.id).toBe(first.id);
    expect(service.listRentals({ page: 1, pageSize: 10 }).total).toBe(1);
    expect(service.listEquipment("Betoneira")[0]?.stockQuantity).toBe(3);
    expect(second.installments).toBeNull();
    expect(second.receiverName).toBe("");
  });

  it("não deixa movimentações de estoque quando a transação falha", async () => {
    const { db, service } = await createTestService();
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
          installments: null,
          clientRequestId: randomUUID()
        },
        user.id
      )
    ).toThrow();

    expect(Number(db.queryOne("SELECT COUNT(*) AS total FROM rentals")?.total)).toBe(0);
    expect(Number(db.queryOne("SELECT COUNT(*) AS total FROM inventory_movements")?.total)).toBe(0);
  });

  it("aplica a migração de idempotência em banco novo", async () => {
    const { db } = await createTestService();
    const columns = db.queryAll("PRAGMA table_info(rentals)").map((row) => String(row.name));
    const index = db.queryOne(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_rentals_client_request_id'"
    );

    expect(columns).toContain("client_request_id");
    expect(index?.name).toBe("idx_rentals_client_request_id");
  });

  it("migra banco v1 preservando dados existentes da versão 0.1.0", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-v1-migration-"));
    const dbPath = path.join(dir, "a3-manager.sqlite");
    const sql = await initSqlJs({
      locateFile: () => path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm")
    });
    const legacyDb = new sql.Database();
    legacyDb.run(migrations[0].sql);
    legacyDb.run("INSERT INTO schema_migrations (id, name, applied_at) VALUES (1, ?, ?)", [
      "initial_schema",
      "2026-08-14T00:00:00.000Z"
    ]);
    legacyDb.run(
      `
        INSERT INTO rentals (
          id, code, status, customer_id, user_id, period, start_date, return_date,
          delivery_street, delivery_neighborhood, delivery_number, delivery_cep,
          delivery_city, delivery_state, receiver_is_customer, receiver_name, receiver_cpf,
          payment_method, installments, customer_name_snapshot, customer_name_snapshot_normalized,
          customer_snapshot_json, company_snapshot_json, launched_by_username, finalized_at,
          created_at, updated_at
        ) VALUES (
          'rental-v1', 'LOC-20260814-0001', 'ONGOING', 'customer-v1', 'user-v1',
          'MONTHLY', '2026-08-14', '2026-09-13', '', '', '', '', '', '', 1, '', '',
          'PIX', NULL, 'Cliente Legado', 'cliente legado', '{}', '{}', 'SYSTEM DEV',
          NULL, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
        )
      `
    );
    fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    const migrated = await SqlJsDatabase.open(dbPath);
    const columns = migrated.queryAll("PRAGMA table_info(rentals)").map((row) => String(row.name));
    const rental = migrated.queryOne("SELECT code, client_request_id FROM rentals WHERE id = ?", [
      "rental-v1"
    ]);
    const applied = migrated.queryAll("SELECT id FROM schema_migrations ORDER BY id");
    migrated.close();

    expect(columns).toContain("client_request_id");
    expect(rental?.code).toBe("LOC-20260814-0001");
    expect(rental?.client_request_id).toBeNull();
    expect(applied.map((row) => Number(row.id))).toEqual([1, 2]);
  });
});
