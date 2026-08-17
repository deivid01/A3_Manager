import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/appError";
import type { DbParam, DbRow, SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
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
import { createTestService, validCustomer } from "./helpers";

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
        name: "Cliente Remoto",
        name_normalized: "cliente remoto",
        cpf: "529.982.247-25",
        cpf_normalized: "52998224725",
        rg: "",
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
});

function buildCoordinator(db: SqlJsDatabase, remote: FakeA20sClient): SyncCoordinator {
  return new SyncCoordinator({
    db,
    configStore: configStoreWithToken(),
    createClient: (_config: EffectiveA20sConfig) => remote,
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

    const snapshotTable = /FROM\s+(\w+)\s+ORDER BY/.exec(sql)?.[1] as
      | SyncTableName
      | undefined;
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
