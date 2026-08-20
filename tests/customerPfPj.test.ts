import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/appError";
import { normalizeSearch } from "../src/domain/normalization";
import { getCustomerDisplayName } from "../src/domain/customerDisplay";
import { SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import { migrations } from "../src/infrastructure/database/schema";
import type { CustomerInput } from "../src/shared/contracts";
import { createTestService, validCustomer, validEquipment } from "./helpers";

const validPjCustomer: CustomerInput = {
  customerType: "PJ",
  name: "",
  cpf: "",
  rg: "",
  legalName: "Construcoes Machado Ltda",
  tradeName: "Machado Locacao",
  cnpj: "04.252.011/0001-10",
  stateRegistration: "110.042.490.114",
  street: "Rua das Obras",
  neighborhood: "Industrial",
  number: "250",
  cep: "01001-000",
  city: "Sao Paulo",
  state: "SP",
  contact: "(11) 3333-4444",
};

describe("clientes PF/PJ", () => {
  it("migra cliente existente sem customer_type como PF preservando dados e ID", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-customer-type-migration-"));
    const dbPath = path.join(dir, "a3-manager.sqlite");
    const sql = await initSqlJs({
      locateFile: () => path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    });
    const legacyDb = new sql.Database();
    const now = "2026-08-18T00:00:00.000Z";

    for (const migration of migrations.filter((item) => item.id < 5)) {
      legacyDb.run(migration.sql);
      legacyDb.run(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
        [migration.id, migration.name, now],
      );
    }

    legacyDb.run(
      `INSERT INTO customers
        (id, name, name_normalized, cpf, cpf_normalized, rg, street,
         neighborhood, number, cep, city, state, contact, archived_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        "customer-legacy",
        "Cliente Legado",
        normalizeSearch("Cliente Legado"),
        "529.982.247-25",
        "52998224725",
        "MG-12.345.678",
        "Rua Antiga",
        "Centro",
        "10",
        "01001-000",
        "Sao Paulo",
        "SP",
        "Contato",
        now,
        now,
      ],
    );
    fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    const migrated = await SqlJsDatabase.open(dbPath);
    const customer = migrated.queryOne("SELECT * FROM customers WHERE id = ?", ["customer-legacy"]);
    migrated.close();

    expect(customer).toMatchObject({
      id: "customer-legacy",
      customer_type: "PF",
      name: "Cliente Legado",
      cpf: "529.982.247-25",
      rg: "MG-12.345.678",
    });
  });

  it("mantem CRUD PF compativel e validacao de CPF existente", async () => {
    const { service } = await createTestService();

    const created = service.createCustomer(validCustomer);
    const updated = service.updateCustomer(created.id, {
      ...validCustomer,
      name: "Maria Oliveira Atualizada",
    });

    expect(created.customerType).toBe("PF");
    expect(updated.id).toBe(created.id);
    expect(updated.customerType).toBe("PF");
    expect(updated.name).toBe("Maria Oliveira Atualizada");
    expect(updated.cpf).toBe("529.982.247-25");
    expect(() =>
      service.createCustomer({ ...validCustomer, cpf: "111.111.111-11" }),
    ).toThrow(AppError);
  });

  it("cria PJ com campos de identidade preenchidos", async () => {
    const { service } = await createTestService();

    const customer = service.createCustomer(validPjCustomer);

    expect(customer.customerType).toBe("PJ");
    expect(customer.id).toBeTruthy();
    expect(customer.legalName).toBe("Construcoes Machado Ltda");
    expect(customer.tradeName).toBe("Machado Locacao");
    expect(customer.cnpj).toBe("04.252.011/0001-10");
    expect(customer.stateRegistration).toBe("110.042.490.114");
    expect(customer.name).toBe("");
    expect(customer.cpf).toBe("");
  });

  it("cria PJ sem CNPJ", async () => {
    const { service } = await createTestService();

    const customer = service.createCustomer({
      ...validPjCustomer,
      cnpj: "",
      legalName: "Empresa Sem Documento Ltda",
      tradeName: "",
    });

    expect(customer.customerType).toBe("PJ");
    expect(customer.cnpj).toBe("");
    expect(getCustomerDisplayName(customer)).toBe("Empresa Sem Documento Ltda");
  });

  it("rejeita cliente completamente vazio", async () => {
    const { service } = await createTestService();

    expect(() =>
      service.createCustomer({
        customerType: "PF",
        name: "",
        cpf: "",
        rg: "",
        legalName: "",
        tradeName: "",
        cnpj: "",
        stateRegistration: "",
        street: "",
        neighborhood: "",
        number: "",
        cep: "",
        city: "",
        state: "",
        contact: "",
      }),
    ).toThrow(AppError);
  });

  it("rejeita CNPJ nao vazio invalido", async () => {
    const { service } = await createTestService();

    expect(() =>
      service.createCustomer({
        ...validPjCustomer,
        cnpj: "04.252.011/0001-11",
      }),
    ).toThrow(AppError);
  });

  it("edita PJ sem alterar ID", async () => {
    const { service } = await createTestService();
    const created = service.createCustomer(validPjCustomer);

    const updated = service.updateCustomer(created.id, {
      ...validPjCustomer,
      tradeName: "Machado Equipamentos",
      stateRegistration: "",
    });

    expect(updated.id).toBe(created.id);
    expect(updated.customerType).toBe("PJ");
    expect(updated.tradeName).toBe("Machado Equipamentos");
    expect(updated.stateRegistration).toBe("");
  });

  it("busca PJ por razao social, nome fantasia e CNPJ", async () => {
    const { service } = await createTestService();
    const customer = service.createCustomer(validPjCustomer);

    expect(service.searchCustomers("Construcoes")[0]?.id).toBe(customer.id);
    expect(service.searchCustomers("Machado")[0]?.id).toBe(customer.id);
    expect(service.searchCustomers("04252011")[0]?.id).toBe(customer.id);
  });

  it("preserva campos PJ no snapshot de nova locacao", async () => {
    const { service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validPjCustomer);
    const equipment = service.createEquipment(validEquipment);

    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "MONTHLY",
        startDate: "2026-08-18",
        items: [{ equipmentId: equipment.id, quantity: 1 }],
        deliveryStreet: "",
        deliveryNeighborhood: "",
        deliveryNumber: "",
        deliveryCep: "",
        deliveryCity: "",
        deliveryState: "",
        paymentMethod: "PIX",
        installments: null,
      },
      user.id,
    );

    expect(rental.customerSnapshot.customerType).toBe("PJ");
    expect(rental.customerSnapshot.legalName).toBe("Construcoes Machado Ltda");
    expect(rental.customerSnapshot.tradeName).toBe("Machado Locacao");
    expect(rental.customerSnapshot.cnpj).toBe("04.252.011/0001-10");
    expect(rental.customerSnapshot.stateRegistration).toBe("110.042.490.114");
    expect(service.listRentals({ page: 1, pageSize: 10 }).rows[0]?.customerName).toBe(
      "Machado Locacao",
    );
  });

  it("carrega snapshot legado como registro PF compativel", async () => {
    const { db, service } = await createTestService();
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const company = service.getCompany();
    const now = "2026-08-18T00:00:00.000Z";
    const legacySnapshot = {
      id: customer.id,
      name: "Cliente Legado",
      cpf: "529.982.247-25",
      rg: "MG-12.345.678",
      street: "Rua Antiga",
      neighborhood: "Centro",
      number: "10",
      cep: "01001-000",
      city: "Sao Paulo",
      state: "SP",
      contact: "Contato",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.execute(
      `INSERT INTO rentals
        (id, code, status, customer_id, user_id, period, start_date, return_date,
         delivery_street, delivery_neighborhood, delivery_number, delivery_cep,
         delivery_city, delivery_state, receiver_is_customer, receiver_name,
         receiver_cpf, payment_method, installments, customer_name_snapshot,
         customer_name_snapshot_normalized, customer_snapshot_json,
         company_snapshot_json, launched_by_username, client_request_id,
         finalized_at, archived_at, archived_by_user_id, created_at, updated_at)
       VALUES (?, ?, 'ONGOING', ?, ?, 'MONTHLY', '2026-08-18', '2026-09-18',
         '', '', '', '', '', '', 1, '', '', 'PIX', NULL, ?, ?, ?, ?, ?,
         NULL, NULL, NULL, NULL, ?, ?)`,
      [
        "legacy-rental",
        "LOC-20260818-9999",
        customer.id,
        user.id,
        "Cliente Legado",
        normalizeSearch("Cliente Legado"),
        JSON.stringify(legacySnapshot),
        JSON.stringify(company),
        user.username,
        now,
        now,
      ],
    );

    const rental = service.getRental("legacy-rental");

    expect(rental.customerSnapshot.customerType).toBe("PF");
    expect(rental.customerSnapshot.name).toBe("Cliente Legado");
    expect(rental.customerSnapshot.cpf).toBe("529.982.247-25");
    expect(rental.customerSnapshot.legalName).toBe("");
  });
});
