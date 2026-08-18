import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApplicationService } from "../src/application/ApplicationService";
import { SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import type { CustomerInput, EquipmentInput } from "../src/shared/contracts";

export async function createTestService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-manager-"));
  const db = await SqlJsDatabase.open(path.join(dir, "test.sqlite"));
  const service = new ApplicationService(db);
  await service.initialize();
  return { db, service, dir };
}

export const validCustomer: CustomerInput = {
  name: "Maria Oliveira",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  street: "Rua Central",
  neighborhood: "Centro",
  number: "100",
  cep: "01001-000",
  city: "São Paulo",
  state: "SP",
  contact: "(11) 99999-0000"
};

export const validEquipment: EquipmentInput = {
  name: "Betoneira 400L",
  dailyRateCents: 10000,
  weeklyRateCents: 15000,
  biweeklyRateCents: 22000,
  monthlyRateCents: 28000,
  unitIndemnificationValueCents: 20000,
  stockQuantity: 5
};
