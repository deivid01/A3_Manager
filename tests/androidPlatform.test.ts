import { describe, expect, it } from "vitest";
import type { UserInput } from "../src/shared/contracts";
import type { DbParam, DbRow, SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import { syncTables, type SyncTableName } from "../src/infrastructure/sync/syncTables";
import type { AndroidNativeBridge } from "../src/renderer/platform/androidNativeBridge";
import { createAndroidA3Api } from "../src/renderer/platform/androidA3Api";
import { createTestService, validCustomer, validEquipment } from "./helpers";

describe("adaptador Android fase 2", () => {
  it("não devolve o token da API remota ao renderer", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    native.savedToken = "secret-token";
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    await api.login({ username: "SYSTEM DEV", password: "_int@383" });
    const publicConfig = await api.getA20sConfig();

    expect(publicConfig).toEqual({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      tokenConfigured: true,
    });
    expect(JSON.stringify(publicConfig)).not.toContain("secret-token");
  });

  it("mantém configuração sensível atrás da ponte nativa e permite apenas ADMIN", async () => {
    const { db, service } = await createTestService();
    const userInput: UserInput = {
      username: "operador android",
      password: "senha123",
      role: "USER",
    };
    await service.createUser(userInput);
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    await api.login({ username: "operador android", password: "senha123" });
    await expect(api.getA20sConfig()).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });

    await api.login({ username: "SYSTEM DEV", password: "_int@383" });
    const saved = await api.saveA20sConfig({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      token: "native-secret",
    });

    expect(saved.tokenConfigured).toBe(true);
    expect(native.savedToken).toBe("native-secret");
    expect(JSON.stringify(saved)).not.toContain("native-secret");
  });

  it("autentica usuários Android com a mesma normalização e roles do desktop", async () => {
    const { db, service } = await createTestService();
    await service.createUser({
      username: "operador dois",
      password: "senha123",
      role: "USER",
    });
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    const user = await api.login({
      username: " operador  dois ",
      password: "senha123",
    });

    expect(user.username).toBe("OPERADOR DOIS");
    expect(user.role).toBe("USER");
    await expect(api.listUsers()).rejects.toMatchObject({
      code: "AUTH_FORBIDDEN",
    });
  });

  it("sincroniza cliente PF/PJ criado no Android para a base remota permitida", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    await api.login({ username: "SYSTEM DEV", password: "_int@383" });
    const pj = await api.createCustomer({
      ...validCustomer,
      customerType: "PJ",
      name: "",
      cpf: "",
      rg: "",
      legalName: "A3 Construções LTDA",
      tradeName: "A3 Obras",
      cnpj: "11.222.333/0001-81",
      stateRegistration: "ISENTO",
    });

    const remoteCustomer = native.rows.get("customers")?.find((row) => row.id === pj.id);
    expect(remoteCustomer).toMatchObject({
      customer_type: "PJ",
      legal_name: "A3 Construções LTDA",
      trade_name: "A3 Obras",
      cnpj: "11.222.333/0001-81",
    });
    expect(JSON.stringify(remoteCustomer)).not.toContain("receiver");
  });

  it("preserva preço, snapshot, estoque e finalização ao sincronizar locação Android", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    const user = await api.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = await api.createCustomer(validCustomer);
    const equipment = await api.createEquipment(validEquipment);
    const rental = await api.launchRental({
      customerId: customer.id,
      period: "BIWEEKLY",
      startDate: "2026-08-19",
      items: [{ equipmentId: equipment.id, quantity: 2 }],
      deliveryStreet: "",
      deliveryNeighborhood: "",
      deliveryNumber: "",
      deliveryCep: "",
      deliveryCity: "",
      deliveryState: "",
      paymentMethod: "PIX",
      installments: null,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
    });
    const finalized = await api.finalizeRental(rental.id);

    const remoteRental = native.rows.get("rentals")?.find((row) => row.id === rental.id);
    const remoteItem = native.rows.get("rental_items")?.find((row) => row.rental_id === rental.id);
    const remoteEquipment = native.rows.get("equipment")?.find((row) => row.id === equipment.id);
    const movements = native.rows.get("inventory_movements")?.filter(
      (row) => row.rental_id === rental.id,
    );

    expect(remoteRental).toMatchObject({
      status: "FINALIZED",
      user_id: user.id,
      customer_name_snapshot: validCustomer.name,
      receiver_name: "",
      receiver_cpf: "",
      client_request_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(remoteItem).toMatchObject({
      quantity: 2,
      unit_rental_rate_cents: validEquipment.biweeklyRateCents,
      unit_indemnification_value_cents:
        validEquipment.unitIndemnificationValueCents,
    });
    expect(remoteEquipment?.stock_quantity).toBe(validEquipment.stockQuantity);
    expect(movements?.map((row) => row.type).sort()).toEqual([
      "RENTAL_OUT",
      "RENTAL_RETURN",
    ]);
    expect(finalized.status).toBe("FINALIZED");
  });

  it("retorna erro controlado quando o servidor não aceita uma mutação", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    native.failUpsert = true;
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    await api.login({ username: "SYSTEM DEV", password: "_int@383" });
    await expect(api.createCustomer(validCustomer)).rejects.toMatchObject({
      code: "A3-SYNC-005",
    });
    await expect(api.getSyncStatus()).resolves.toMatchObject({
      state: "pending",
      pendingCount: 1,
    });
  });

  it("mantém PDF e impressão fora do escopo da fase 2", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const native = new FakeAndroidNativeBridge();
    seedNativeFromDb(native, db);
    const api = createAndroidA3Api({ nativeBridge: native, dbFactory: async () => db });

    await api.login({ username: "SYSTEM DEV", password: "_int@383" });

    await expect(api.saveRentalPdf("rental-1")).rejects.toMatchObject({
      code: "ANDROID_PHASE_2_NOT_IMPLEMENTED",
    });
    await expect(api.printRental("rental-1", "report")).rejects.toMatchObject({
      code: "ANDROID_PHASE_2_NOT_IMPLEMENTED",
    });
  });
});

function prepareLinkedMirror(db: SqlJsDatabase): void {
  db.withOutboxSuppressed(() => {
    db.transaction(() => {
      db.execute("DELETE FROM sync_outbox");
      db.execute(
        `INSERT INTO sync_state (key, value, updated_at)
         VALUES ('linked_a20s_database', 'a3_manager', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [new Date().toISOString()],
      );
    });
  });
}

function seedNativeFromDb(native: FakeAndroidNativeBridge, db: SqlJsDatabase): void {
  for (const table of syncTables) {
    native.rows.set(
      table.name,
      db.queryAll(
        `SELECT ${table.columns.join(", ")} FROM ${table.name} ORDER BY ${table.primaryKey}`,
      ),
    );
  }
}

class FakeAndroidNativeBridge implements AndroidNativeBridge {
  savedToken = "secret-token";
  failUpsert = false;
  readonly rows = new Map<SyncTableName, DbRow[]>(
    syncTables.map((table) => [table.name, []]),
  );
  private baseUrl = "http://10.155.37.230:3000";
  private database = "a3_manager";

  async getPublicConfig() {
    return {
      baseUrl: this.baseUrl,
      database: this.database,
      tokenConfigured: Boolean(this.savedToken),
    };
  }

  async saveConfig(input: { baseUrl: string; database: string; token?: string }) {
    this.baseUrl = input.baseUrl.replace(/\/$/, "");
    this.database = input.database;
    if (input.token?.trim()) {
      this.savedToken = input.token.trim();
    }
    return this.getPublicConfig();
  }

  async testConnection() {
    return {
      ok: true,
      health: true,
      authenticated: true,
      databaseFound: true,
      message: "Conexão com o servidor de sincronização confirmada.",
    };
  }

  async listRemoteTables() {
    return {
      tables: [...syncTables.map((table) => table.name), "a3_sync_metadata"],
    };
  }

  async readMetadata() {
    return { value: "a3_manager_sync_v1" };
  }

  async tableInfo(input: { table: SyncTableName }) {
    return {
      columns:
        syncTables.find((table) => table.name === input.table)?.columns ?? [],
    };
  }

  async countRows(input: { table: SyncTableName }) {
    return { total: this.rows.get(input.table)?.length ?? 0 };
  }

  async selectRows(input: {
    table: SyncTableName;
    columns: string[];
    limit: number;
    offset: number;
  }) {
    const rows = [...(this.rows.get(input.table) ?? [])]
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .slice(input.offset, input.offset + input.limit)
      .map((row) =>
        Object.fromEntries(input.columns.map((column) => [column, row[column]])),
      );
    return { rows };
  }

  async upsertRow(input: { table: SyncTableName; row: Record<string, DbParam> }) {
    if (this.failUpsert) {
      const error = new Error("Falha simulada de servidor.");
      error.name = "A3-SYNC-005";
      (error as Error & { code?: string }).code = "A3-SYNC-005";
      throw error;
    }
    const rows = this.rows.get(input.table) ?? [];
    this.rows.set(input.table, [
      ...rows.filter((row) => row.id !== input.row.id),
      input.row,
    ]);
    return { changes: 1 };
  }

  async deleteRow(input: { table: SyncTableName; id: string }) {
    this.rows.set(
      input.table,
      (this.rows.get(input.table) ?? []).filter((row) => row.id !== input.id),
    );
    return { changes: 1 };
  }
}
