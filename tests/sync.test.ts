import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs, { type Database as SqliteDatabase } from "sql.js";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/appError";
import { normalizeSearch } from "../src/domain/normalization";
import type { DbParam, DbRow, SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import { migrations } from "../src/infrastructure/database/schema";
import { A20sDbClient, type A20sDbClientLike } from "../src/infrastructure/sync/A20sDbClient";
import {
  A20sConfigStore,
  type EffectiveA20sConfig,
  type TokenCodec,
} from "../src/infrastructure/sync/A20sConfigStore";
import { SyncCoordinator } from "../src/infrastructure/sync/SyncCoordinator";
import {
  syncTables,
  type SyncTableMetadata,
  type SyncTableName,
} from "../src/infrastructure/sync/syncTables";
import { createTestService, validCustomer, validEquipment } from "./helpers";

describe("A20s DB API client", () => {
  it("faz health sem expor Authorization e autentica chamadas protegidas", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response(
        JSON.stringify(
          String(url).endsWith("/health")
            ? { ok: true, service: "a20s-db-api", uptime: 1, timestamp: "2026-08-17T00:00:00.000Z" }
            : { databases: [{ name: "a3_manager", file: "a3_manager.db", bytes: 1, modifiedAt: "now" }] },
        ),
        { status: 200 },
      );
    }) as typeof fetch;

    const client = new A20sDbClient({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      token: "secret-token",
      fetchImpl,
    });

    await client.health();
    await client.listDatabases();

    expect(calls[0]?.headers.get("Authorization")).toBeNull();
    expect(calls[1]?.headers.get("Authorization")).toBe("Bearer secret-token");
  });

  it("converte timeout em erro de fallback remoto", async () => {
    const fetchImpl = ((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as typeof fetch;

    const client = new A20sDbClient({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      token: "secret-token",
      timeoutMs: 5,
      fetchImpl,
    });

    await expect(client.health()).rejects.toMatchObject({ code: "A3-SYNC-001" });
  });
});

describe("configuração segura do A20s", () => {
  it("não devolve o token salvo na configuração pública", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-sync-config-"));
    const store = new A20sConfigStore(dir, memoryTokenCodec());

    const publicConfig = store.save({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      token: "secret-token",
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(dir, "a20s-sync-config.json"), "utf8"),
    ) as { encryptedToken: string };

    expect(publicConfig).toEqual({
      baseUrl: "http://10.155.37.230:3000",
      database: "a3_manager",
      tokenConfigured: true,
    });
    expect(publicConfig).not.toHaveProperty("token");
    expect(persisted.encryptedToken).not.toContain("secret-token");
    expect(store.loadEffectiveConfig().token).toBe("secret-token");
  });
});

describe("sincronização local/remota", () => {
  it("cria outbox na mesma transação da escrita local", async () => {
    const { db, service } = await createTestService();
    prepareLinkedMirror(db);

    service.createCustomer(validCustomer);

    const pending = Number(db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total);
    const event = db.queryOne("SELECT table_name, operation FROM sync_outbox ORDER BY id DESC LIMIT 1");

    expect(pending).toBe(1);
    expect(event).toMatchObject({ table_name: "customers", operation: "INSERT" });
  });

  it("remove evento após push bem-sucedido e mantém o espelho local operacional", async () => {
    const { db, service } = await createTestService();
    prepareLinkedMirror(db);
    service.createCustomer(validCustomer);
    const remote = new FakeA20sClient();
    const coordinator = buildCoordinator(db, remote);

    const status = await coordinator.syncNow();

    expect(status.state).toBe("online");
    expect(Number(db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total)).toBe(0);
    expect(remote.rows.get("customers")?.some((row) => row.cpf === validCustomer.cpf)).toBe(true);
  });

  it("sincroniza preços por período e arquivamento de locação", async () => {
    const { db, service } = await createTestService();
    prepareLinkedMirror(db);
    const user = await service.login({ username: "SYSTEM DEV", password: "_int@383" });
    const customer = service.createCustomer(validCustomer);
    const equipment = service.createEquipment(validEquipment);
    const rental = service.launchRental(
      {
        customerId: customer.id,
        period: "BIWEEKLY",
        startDate: "2026-08-14",
        items: [{ equipmentId: equipment.id, quantity: 2 }],
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
    service.archiveRental(rental.id, user.id);
    const remote = new FakeA20sClient();
    const coordinator = buildCoordinator(db, remote);

    const status = await coordinator.syncNow();

    const remoteEquipment = remote.rows.get("equipment")?.find((row) => row.id === equipment.id);
    const remoteRental = remote.rows.get("rentals")?.find((row) => row.id === rental.id);
    const remoteItem = remote.rows.get("rental_items")?.find((row) => row.rental_id === rental.id);
    expect(status.state).toBe("online");
    expect(remoteEquipment).toMatchObject({
      daily_rate_cents: 10000,
      weekly_rate_cents: 15000,
      biweekly_rate_cents: 22000,
      monthly_rate_cents: 28000,
    });
    expect(remoteRental?.archived_at).not.toBeNull();
    expect(remoteRental?.archived_by_user_id).toBe(user.id);
    expect(remoteItem?.unit_rental_rate_cents).toBe(22000);
  });

  it("mantém evento pendente quando o push falha e não executa pull", async () => {
    const { db, service } = await createTestService();
    prepareLinkedMirror(db);
    service.createCustomer(validCustomer);
    const remote = new FakeA20sClient();
    remote.failExecute = true;
    const coordinator = buildCoordinator(db, remote);

    const status = await coordinator.syncNow();

    expect(status.state).toBe("pending");
    expect(Number(db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total)).toBe(1);
    expect(remote.snapshotPulls).toBe(0);
  });

  it("aplica pull com outbox suprimido para evitar loop de sincronização", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const remote = new FakeA20sClient();
    remote.rows.set("users", [
      {
        id: "remote-user",
        username: "SYSTEM DEV",
        username_normalized: "system dev",
        password_hash: "hash",
        role: "ADMIN",
        active: 1,
        created_at: "2026-08-17T00:00:00.000Z",
        updated_at: "2026-08-17T00:00:00.000Z",
      },
    ]);
    remote.rows.set("company_settings", [
      {
        id: "default",
        legal_name: "A3",
        trade_name: "A3",
        document: "Documento",
        street: "Rua",
        neighborhood: "Centro",
        number: "1",
        cep: "01001-000",
        city: "São Paulo",
        state: "SP",
        contact: "Contato",
        email: "",
        updated_at: "2026-08-17T00:00:00.000Z",
      },
    ]);
    remote.rows.set("customers", [
      {
        id: "remote-customer",
        customer_type: "PF",
        name: "Cliente Remoto",
        name_normalized: "cliente remoto",
        cpf: "529.982.247-25",
        cpf_normalized: "52998224725",
        rg: "",
        legal_name: null,
        legal_name_normalized: null,
        trade_name: null,
        trade_name_normalized: null,
        cnpj: null,
        cnpj_normalized: null,
        state_registration: null,
        street: "Rua",
        neighborhood: "Centro",
        number: "1",
        cep: "01001-000",
        city: "São Paulo",
        state: "SP",
        contact: "Contato",
        archived_at: null,
        created_at: "2026-08-17T00:00:00.000Z",
        updated_at: "2026-08-17T00:00:00.000Z",
      },
    ]);
    const coordinator = buildCoordinator(db, remote);

    await coordinator.syncNow();

    expect(Number(db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total)).toBe(0);
    expect(db.queryOne("SELECT name FROM customers WHERE id = ?", ["remote-customer"])?.name).toBe(
      "Cliente Remoto",
    );
  });

  it("aplica migrations remotas 5 e 6 preservando cliente referenciado com foreign keys ativas", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const remote = await createSqliteRemoteThroughMigration4();
    seedRemoteRentalFixture(remote);
    const coordinator = buildCoordinator(db, remote);

    const status = await coordinator.syncNow();

    const customer = (
      await remote.query<DbRow>("SELECT * FROM customers WHERE id = ?", [
        "customer-v4",
      ])
    ).rows[0];
    const rental = (
      await remote.query<DbRow>("SELECT customer_id FROM rentals WHERE id = ?", [
        "rental-v4",
      ])
    ).rows[0];
    const foreignKeyCheck = await remote.query<DbRow>("PRAGMA foreign_key_check");
    const foreignKeys = await remote.query<{ foreign_keys: number }>(
      "PRAGMA foreign_keys",
    );
    const applied = await remote.query<{ id: number | string }>(
      "SELECT id FROM schema_migrations ORDER BY id",
    );
    const migration5ScriptIndex = remote.scripts.findIndex((sql) =>
      sql.includes("CREATE TABLE customers_v5"),
    );
    const migration6ScriptIndex = remote.scripts.findIndex((sql) =>
      sql.includes("recreate_customer_outbox_triggers"),
    );

    expect(status.state).toBe("online");
    expect(customer).toMatchObject({
      id: "customer-v4",
      customer_type: "PF",
      name: "Cliente V4",
      cpf: "529.982.247-25",
      rg: "MG-12.345.678",
    });
    expect(rental?.customer_id).toBe("customer-v4");
    expect(foreignKeyCheck.rows).toHaveLength(0);
    expect(Number(foreignKeys.rows[0]?.foreign_keys)).toBe(1);
    expect(applied.rows.map((row) => Number(row.id))).toEqual([1, 2, 4, 5, 6]);
    expect(migration5ScriptIndex).toBeGreaterThanOrEqual(0);
    expect(migration6ScriptIndex).toBeGreaterThan(migration5ScriptIndex);
    expect(remote.scripts[migration5ScriptIndex]).toMatch(
      /PRAGMA foreign_keys = OFF;\s*BEGIN;/,
    );
    expect(remote.scripts[migration5ScriptIndex]).toMatch(
      /COMMIT;\s*PRAGMA foreign_keys = ON;/,
    );
  });

  it("limpa transacao remota aberta quando migration falha", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const remote = await createSqliteRemoteThroughMigration4();
    seedRemoteRentalFixture(remote);
    remote.failCustomerMigrationWithOpenTransaction = true;
    const coordinator = buildCoordinator(db, remote);

    const firstStatus = await coordinator.syncNow();
    const firstApplied = await remote.query<{ id: number | string }>(
      "SELECT id FROM schema_migrations ORDER BY id",
    );
    await expect(remote.script("BEGIN; COMMIT;")).resolves.toMatchObject({
      ok: true,
    });
    const secondStatus = await coordinator.syncNow();
    await expect(remote.script("BEGIN; COMMIT;")).resolves.toMatchObject({
      ok: true,
    });

    expect(firstStatus.state).toBe("error");
    expect(firstStatus.lastErrorMessage).toBe("Falha simulada da migration 5.");
    expect(firstApplied.rows.map((row) => Number(row.id))).toEqual([1, 2, 4]);
    expect(secondStatus.state).toBe("error");
    expect(secondStatus.lastErrorMessage).toBe("Falha simulada da migration 5.");
    expect(secondStatus.lastErrorMessage).not.toContain(
      "cannot start a transaction within a transaction",
    );
  });

  it("mantém um único timer periódico quando start é chamado mais de uma vez", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const remote = new FakeA20sClient();
    const logger = new FakeSyncLogger();
    const coordinator = buildCoordinator(db, remote, logger);

    coordinator.start();
    coordinator.start();
    await coordinator.syncNow();
    coordinator.stop();

    expect(logger.infos.filter((entry) => entry.event === "sync_timer_started")).toHaveLength(1);
    expect(logger.infos.filter((entry) => entry.event === "sync_timer_start_ignored")).toHaveLength(1);
  });

  it("registra duração das fases, linhas do pull e persistência local", async () => {
    const { db } = await createTestService();
    prepareLinkedMirror(db);
    const remote = new FakeA20sClient();
    seedRemoteBaseline(remote);
    remote.rows.set("customers", [
      {
        id: "remote-customer",
        customer_type: "PF",
        name: "Cliente Remoto",
        name_normalized: "cliente remoto",
        cpf: "529.982.247-25",
        cpf_normalized: "52998224725",
        rg: "",
        legal_name: null,
        legal_name_normalized: null,
        trade_name: null,
        trade_name_normalized: null,
        cnpj: null,
        cnpj_normalized: null,
        state_registration: null,
        street: "Rua",
        neighborhood: "Centro",
        number: "1",
        cep: "01001-000",
        city: "São Paulo",
        state: "SP",
        contact: "Contato",
        archived_at: null,
        created_at: "2026-08-17T00:00:00.000Z",
        updated_at: "2026-08-17T00:00:00.000Z",
      },
    ]);
    const logger = new FakeSyncLogger();
    const coordinator = buildCoordinator(db, remote, logger);

    const status = await coordinator.syncNow();

    const completed = logger.infos.find((entry) => entry.event === "sync_completed");
    expect(status.state).toBe("online");
    expect(completed?.details.phaseDurationsMs).toMatchObject({
      health_config: expect.any(Number),
      remote_query: expect.any(Number),
      push_outbox: expect.any(Number),
      pull_remote_snapshot: expect.any(Number),
      apply_local_snapshot: expect.any(Number),
      persist_export_local: expect.any(Number),
    });
    expect(completed?.details.rowCounts).toMatchObject({ customers: 1 });
    expect(completed?.details.localPersist).toMatchObject({
      bytes: expect.any(Number),
      totalDurationMs: expect.any(Number),
    });
  });
});

function buildCoordinator(
  db: SqlJsDatabase,
  remote: A20sDbClientLike,
  logger?: FakeSyncLogger,
): SyncCoordinator {
  return new SyncCoordinator({
    db,
    configStore: configStoreWithToken(),
    createClient: (_config: EffectiveA20sConfig) => remote,
    logger,
    intervalMs: 60_000,
  });
}

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

function seedRemoteBaseline(remote: FakeA20sClient): void {
  remote.rows.set("users", [
    {
      id: "remote-user",
      username: "SYSTEM DEV",
      username_normalized: "system dev",
      password_hash: "hash",
      role: "ADMIN",
      active: 1,
      created_at: "2026-08-17T00:00:00.000Z",
      updated_at: "2026-08-17T00:00:00.000Z",
    },
  ]);
  remote.rows.set("company_settings", [
    {
      id: "default",
      legal_name: "A3",
      trade_name: "A3",
      document: "Documento",
      street: "Rua",
      neighborhood: "Centro",
      number: "1",
      cep: "01001-000",
      city: "São Paulo",
      state: "SP",
      contact: "Contato",
      email: "",
      updated_at: "2026-08-17T00:00:00.000Z",
    },
  ]);
}

class FakeSyncLogger {
  readonly infos: Array<{ event: string; details: Record<string, unknown> }> = [];
  readonly errors: Array<{
    event: string;
    error: unknown;
    details: Record<string, unknown>;
  }> = [];

  info(event: string, details: Record<string, unknown> = {}): void {
    this.infos.push({ event, details });
  }

  error(
    event: string,
    error: unknown,
    details: Record<string, unknown> = {},
  ): void {
    this.errors.push({ event, error, details });
  }
}

function configStoreWithToken(): A20sConfigStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-sync-store-"));
  const store = new A20sConfigStore(dir, memoryTokenCodec());
  store.save({
    baseUrl: "http://10.155.37.230:3000",
    database: "a3_manager",
    token: "secret-token",
  });
  return store;
}

function memoryTokenCodec(): TokenCodec {
  return {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value, "utf8").toString("base64"),
    decrypt: (value) => Buffer.from(value, "base64").toString("utf8"),
  };
}

async function createSqliteRemoteThroughMigration4(): Promise<SqliteA20sClient> {
  const sql = await initSqlJs({
    locateFile: () =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  });
  const remote = new SqliteA20sClient(new sql.Database());
  const now = "2026-08-18T00:00:00.000Z";

  remote.run("PRAGMA foreign_keys = ON;");
  for (const migration of migrations.filter((item) =>
    [1, 2, 4].includes(item.id),
  )) {
    try {
      remote.run(migration.sql);
    } catch (error) {
      throw new Error(
        `Falha ao preparar schema remoto v4 na migration ${migration.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    remote.run(
      "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
      [migration.id, migration.name, now],
    );
  }
  remote.run(`
    CREATE TABLE a3_sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO a3_sync_metadata (key, value, updated_at)
    VALUES ('schema', 'a3_manager_sync_v1', CURRENT_TIMESTAMP);
  `);

  return remote;
}

function seedRemoteRentalFixture(remote: SqliteA20sClient): void {
  const now = "2026-08-18T00:00:00.000Z";

  remote.run(
    `INSERT INTO users
      (id, username, username_normalized, password_hash, role, active,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ["user-v4", "SYSTEM DEV", "system dev", "hash", "ADMIN", now, now],
  );
  remote.run(
    `INSERT INTO customers
      (id, name, name_normalized, cpf, cpf_normalized, rg, street,
       neighborhood, number, cep, city, state, contact, archived_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      "customer-v4",
      "Cliente V4",
      normalizeSearch("Cliente V4"),
      "529.982.247-25",
      "52998224725",
      "MG-12.345.678",
      "Rua V4",
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
  remote.run(
    `INSERT INTO rentals
      (id, code, status, customer_id, user_id, period, start_date, return_date,
       delivery_street, delivery_neighborhood, delivery_number, delivery_cep,
       delivery_city, delivery_state, receiver_is_customer, receiver_name,
       receiver_cpf, payment_method, installments, customer_name_snapshot,
       customer_name_snapshot_normalized, customer_snapshot_json,
       company_snapshot_json, launched_by_username, finalized_at,
       created_at, updated_at, client_request_id, archived_at, archived_by_user_id)
     VALUES (?, ?, 'ONGOING', ?, ?, 'MONTHLY', '2026-08-18', '2026-09-18',
       '', '', '', '', '', '', 1, '', '', 'PIX', NULL, ?, ?, ?, ?, ?,
       NULL, ?, ?, NULL, NULL, NULL)`,
    [
      "rental-v4",
      "LOC-20260818-0001",
      "customer-v4",
      "user-v4",
      "Cliente V4",
      normalizeSearch("Cliente V4"),
      JSON.stringify({ id: "customer-v4", name: "Cliente V4" }),
      "{}",
      "SYSTEM DEV",
      now,
      now,
    ],
  );
}

class SqliteA20sClient implements A20sDbClientLike {
  readonly scripts: string[] = [];
  failCustomerMigrationWithOpenTransaction = false;

  constructor(private readonly database: SqliteDatabase) {}

  run(sql: string, params: DbParam[] = []): void {
    if (params.length === 0) {
      this.database.run(sql);
      return;
    }
    this.database.run(sql, params);
  }

  async health() {
    return {
      ok: true as const,
      service: "a20s-db-api",
      uptime: 1,
      timestamp: "2026-08-17T00:00:00.000Z",
    };
  }

  async listDatabases() {
    return {
      databases: [
        {
          name: "a3_manager",
          file: "a3_manager.db",
          bytes: 1,
          modifiedAt: "2026-08-17T00:00:00.000Z",
        },
      ],
    };
  }

  async query<T>(sql: string, params: unknown[] = []) {
    return response(this.queryRows<T>(sql, params));
  }

  async execute(sql: string, params: unknown[] = []) {
    this.database.run(sql, params.map(toSqliteParam));
    return executeResponse();
  }

  async script(sql: string) {
    this.scripts.push(sql);
    if (
      this.failCustomerMigrationWithOpenTransaction &&
      sql.includes("CREATE TABLE customers_v5")
    ) {
      this.database.run("PRAGMA foreign_keys = OFF; BEGIN;");
      throw new AppError("A3-SYNC-004", "Falha simulada da migration 5.");
    }

    this.database.run(sql);
    return { ok: true as const, durationMs: 1 };
  }

  private queryRows<T>(sql: string, params: unknown[]): T[] {
    const statement = this.database.prepare(sql);
    const rows: T[] = [];

    try {
      statement.bind(params.map(toSqliteParam));
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }
}

class FakeA20sClient implements A20sDbClientLike {
  readonly rows = new Map<SyncTableName, DbRow[]>(
    syncTables.map((table) => [table.name, []]),
  );
  failExecute = false;
  snapshotPulls = 0;

  async health() {
    return {
      ok: true as const,
      service: "a20s-db-api",
      uptime: 1,
      timestamp: "2026-08-17T00:00:00.000Z",
    };
  }

  async listDatabases() {
    return {
      databases: [
        {
          name: "a3_manager",
          file: "a3_manager.db",
          bytes: 1,
          modifiedAt: "2026-08-17T00:00:00.000Z",
        },
      ],
    };
  }

  async query<T>(sql: string, params: unknown[] = []) {
    if (sql.includes("sqlite_master")) {
      return {
        ok: true as const,
        rows: [
          ...syncTables.map((table) => ({ name: table.name })),
          { name: "a3_sync_metadata" },
        ] as T[],
        count: syncTables.length + 1,
        durationMs: 1,
      };
    }

    if (sql.includes("a3_sync_metadata")) {
      return response([{ value: "a3_manager_sync_v1" }] as T[]);
    }

    const pragmaTable = /PRAGMA table_info\((\w+)\)/.exec(sql)?.[1] as
      | SyncTableName
      | undefined;
    if (pragmaTable) {
      const table = syncTables.find((item) => item.name === pragmaTable);
      return response((table?.columns.map((name) => ({ name })) ?? []) as T[]);
    }

    const countTable = /SELECT COUNT\(\*\) AS total FROM (\w+)/.exec(sql)?.[1] as
      | SyncTableName
      | undefined;
    if (countTable) {
      return response([{ total: this.rows.get(countTable)?.length ?? 0 }] as T[]);
    }

    const snapshotTableName = /FROM\s+(\w+)\s+ORDER BY/.exec(sql)?.[1];
    const snapshotTable = syncTables.some((table) => table.name === snapshotTableName)
      ? snapshotTableName as SyncTableName
      : undefined;
    if (snapshotTable) {
      this.snapshotPulls += 1;
      const limit = Number(params[0] ?? 500);
      const offset = Number(params[1] ?? 0);
      const rows = [...(this.rows.get(snapshotTable) ?? [])].sort((a, b) =>
        String(a.id).localeCompare(String(b.id)),
      );
      return response(rows.slice(offset, offset + limit) as T[]);
    }

    return response([] as T[]);
  }

  async execute(sql: string, params: unknown[] = []) {
    if (this.failExecute) {
      throw new AppError("A3-SYNC-005", "Falha simulada de push.");
    }

    const deleteTable = /DELETE FROM (\w+) WHERE/.exec(sql)?.[1] as
      | SyncTableName
      | undefined;
    if (deleteTable) {
      this.rows.set(
        deleteTable,
        (this.rows.get(deleteTable) ?? []).filter((row) => row.id !== params[0]),
      );
      return executeResponse();
    }

    const tableName = /INSERT INTO (\w+)/.exec(sql)?.[1] as SyncTableName | undefined;
    const table = tableName
      ? syncTables.find((item) => item.name === tableName)
      : undefined;
    if (table) {
      const row = rowFromParams(table, params);
      const rows = this.rows.get(table.name) ?? [];
      const next = rows.filter((existing) => existing.id !== row.id);
      next.push(row);
      this.rows.set(table.name, next);
    }

    return executeResponse();
  }

  async script(_sql: string) {
    return { ok: true as const, durationMs: 1 };
  }
}

function response<T>(rows: T[]) {
  return { ok: true as const, rows, count: rows.length, durationMs: 1 };
}

function executeResponse() {
  return { ok: true as const, changes: 1, lastInsertRowid: "1", durationMs: 1 };
}

function rowFromParams(table: SyncTableMetadata, params: unknown[]): DbRow {
  return Object.fromEntries(
    table.columns.map((column, index) => [column, params[index] as DbParam]),
  );
}

function toSqliteParam(value: unknown): DbParam {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return String(value);
}
