import { assertAdminOperationAllowed } from "../../application/authorization";
import { DEFAULT_EQUIPMENT_CATALOG } from "../../domain/equipmentCatalog";
import { AppError, type AppErrorCode } from "../../domain/appError";
import { normalizeSearch } from "../../domain/normalization";
import type { User } from "../../domain/types";
import type {
  A20sSyncConfigInput,
  A20sSyncPublicConfig,
  SyncConnectionState,
  SyncStatus,
  SyncTestResult,
} from "../../shared/contracts";
import type { DbParam, DbRow } from "../../infrastructure/database/SqlJsDatabase";
import {
  deleteOrder,
  syncTableByName,
  syncTables,
  type SyncTableMetadata,
  type SyncTableName,
} from "../../infrastructure/sync/syncTables";
import type { AndroidNativeBridge } from "./androidNativeBridge";

type OutboxOperation = "INSERT" | "UPDATE" | "DELETE";

const androidSyncErrorCodes = new Set<AppErrorCode>([
  "A3-SYNC-001",
  "A3-SYNC-002",
  "A3-SYNC-003",
  "A3-SYNC-004",
  "A3-SYNC-005",
  "A3-SYNC-006",
  "A3-SYNC-007",
  "A3-SYNC-008",
  "A3-SYNC-009",
]);

interface OutboxEvent {
  id: number;
  tableName: string;
  rowId: string;
  operation: OutboxOperation;
}

interface LocalDatabase {
  queryAll(sql: string, params?: DbParam[]): DbRow[];
  queryOne(sql: string, params?: DbParam[]): DbRow | null;
  execute(sql: string, params?: DbParam[]): void;
  transaction<T>(operation: () => T): T;
  withOutboxSuppressed<T>(operation: () => T): T;
}

const remoteSchemaMarker = "a3_manager_sync_v1";

export class AndroidSyncCoordinator {
  private status: SyncStatus = {
    state: "not_configured",
    baseUrl: "",
    database: "",
    pendingCount: 0,
    lastSuccessfulSyncAt: null,
    lastAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
  private syncInFlight: Promise<SyncStatus> | null = null;
  private listeners = new Set<(status: SyncStatus) => void>();

  constructor(
    private readonly db: LocalDatabase,
    private readonly native: AndroidNativeBridge,
  ) {}

  async initialize(): Promise<void> {
    await this.refreshLocalStatus();
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatusSnapshot());
    return () => this.listeners.delete(listener);
  }

  async getStatus(): Promise<SyncStatus> {
    await this.refreshStatusBase();
    this.status.pendingCount = this.countPendingOutbox();
    return this.getStatusSnapshot();
  }

  async getPublicConfig(actor: Pick<User, "role">): Promise<A20sSyncPublicConfig> {
    assertAdminOperationAllowed(actor, "server-configuration");
    return this.native.getPublicConfig();
  }

  async saveConfig(
    input: A20sSyncConfigInput,
    actor: Pick<User, "role">,
  ): Promise<A20sSyncPublicConfig> {
    assertAdminOperationAllowed(actor, "server-configuration");
    const saved = await this.native.saveConfig(input);
    await this.refreshLocalStatus();
    void this.syncNow();
    return saved;
  }

  async testConnection(
    input: A20sSyncConfigInput,
    actor: Pick<User, "role">,
  ): Promise<SyncTestResult> {
    assertAdminOperationAllowed(actor, "server-configuration");
    return this.native.testConnection(input);
  }

  syncNow(actor?: Pick<User, "role">): Promise<SyncStatus> {
    if (actor) {
      assertAdminOperationAllowed(actor, "server-configuration");
    }
    if (this.syncInFlight) {
      return this.syncInFlight;
    }
    this.syncInFlight = this.runSync().finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  requestFreshData(): void {
    void this.syncNow();
  }

  async pushMutationToRemote<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = await operation();
    const status = await this.syncNow();
    if (status.state !== "online") {
      throw new AppError(
        toAndroidSyncErrorCode(status.lastErrorCode),
        status.lastErrorMessage ??
          "Servidor de sincronização indisponível. A alteração ficou pendente.",
      );
    }
    return result;
  }

  private async runSync(): Promise<SyncStatus> {
    await this.setStatus("syncing");
    const attemptedAt = new Date().toISOString();
    this.writeState("last_attempt_at", attemptedAt);

    try {
      const publicConfig = await this.native.getPublicConfig();
      if (!publicConfig.tokenConfigured) {
        throw new AppError(
          "A3-SYNC-009",
          "Servidor de sincronização não configurado.",
        );
      }
      await this.assertRemoteReady();
      await this.ensureLinkedRemote();
      await this.flushOutbox();
      if (this.countPendingOutbox() === 0) {
        await this.pullRemoteSnapshot();
      }
      const syncedAt = new Date().toISOString();
      this.writeState("last_successful_sync_at", syncedAt);
      this.writeState("linked_a20s_database", publicConfig.database);
      await this.setStatus("online");
      return this.getStatusSnapshot();
    } catch (error) {
      const appError = toAppError(error);
      await this.setStatus(
        mapErrorToState(appError.code, this.countPendingOutbox()),
        appError.code,
        appError.message,
      );
      return this.getStatusSnapshot();
    }
  }

  private async assertRemoteReady(): Promise<void> {
    const tables = await this.native.listRemoteTables();
    const tableSet = new Set(tables.tables);
    const missingTables = [
      ...syncTables.map((table) => table.name),
      "a3_sync_metadata",
    ].filter((table) => !tableSet.has(table));
    if (missingTables.length > 0) {
      throw new AppError(
        "A3-SYNC-004",
        "Banco remoto não está preparado para sincronização do A3 Manager.",
      );
    }

    const marker = await this.native.readMetadata({ key: "schema" });
    if (marker.value !== remoteSchemaMarker) {
      throw new AppError(
        "A3-SYNC-004",
        "Marcador de sincronização remoto incompatível.",
      );
    }

    for (const table of syncTables) {
      const remoteInfo = await this.native.tableInfo({ table: table.name });
      const remoteColumns = new Set(remoteInfo.columns);
      const missingColumns = table.columns.filter(
        (column) => !remoteColumns.has(column),
      );
      if (missingColumns.length > 0) {
        throw new AppError(
          "A3-SYNC-004",
          `Schema remoto incompatível em ${table.name}.`,
        );
      }
    }
  }

  private async ensureLinkedRemote(): Promise<void> {
    const publicConfig = await this.native.getPublicConfig();
    if (this.readState("linked_a20s_database") === publicConfig.database) {
      return;
    }

    if (!this.isLocalFreshInstall()) {
      throw new AppError(
        "A3-SYNC-007",
        "Local e remoto possuem dados sem vínculo conhecido. A sincronização automática foi bloqueada.",
      );
    }

    if ((await this.countRemoteBusinessRows()) === 0) {
      throw new AppError(
        "A3-SYNC-007",
        "Banco remoto ainda não possui dados A3 para sincronizar com este Android.",
      );
    }

    this.clearOutboxAndMarkLinked(publicConfig.database);
    await this.pullRemoteSnapshot();
  }

  private async flushOutbox(): Promise<void> {
    while (true) {
      const events = this.loadOutboxBatch();
      if (events.length === 0) {
        return;
      }

      for (const event of events) {
        const table = syncTableByName.get(event.tableName as SyncTableName);
        if (!table) {
          throw new AppError(
            "A3-SYNC-005",
            `Tabela não permitida no outbox: ${event.tableName}.`,
          );
        }

        try {
          if (event.operation === "DELETE") {
            await this.native.deleteRow({
              table: table.name,
              id: event.rowId,
            });
          } else {
            const row = this.db.queryOne(
              `SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE ${table.primaryKey} = ?`,
              [event.rowId],
            );
            if (row) {
              await this.native.upsertRow({
                table: table.name,
                row: rowToNative(table, row),
              });
            }
          }
          this.db.execute("DELETE FROM sync_outbox WHERE id = ?", [event.id]);
        } catch (error) {
          const appError = toAppError(error, "A3-SYNC-005");
          this.db.execute(
            `UPDATE sync_outbox
             SET attempts = attempts + 1, last_error = ?
             WHERE id = ?`,
            [appError.message, event.id],
          );
          throw appError;
        }
      }
    }
  }

  private async pullRemoteSnapshot(): Promise<void> {
    if (this.countPendingOutbox() > 0) {
      throw new AppError(
        "A3-SYNC-006",
        "Pull remoto bloqueado porque ainda existem alterações locais pendentes.",
      );
    }

    const snapshot = new Map<SyncTableName, DbRow[]>();
    for (const table of syncTables) {
      const rows: DbRow[] = [];
      let offset = 0;
      while (true) {
        const result = await this.native.selectRows({
          table: table.name,
          columns: table.columns,
          limit: 500,
          offset,
        });
        rows.push(...result.rows);
        if (result.rows.length < 500) {
          break;
        }
        offset += result.rows.length;
      }
      snapshot.set(table.name, rows);
    }

    this.db.withOutboxSuppressed(() => {
      this.db.transaction(() => {
        for (const table of deleteOrder) {
          this.db.execute(`DELETE FROM ${table.name}`);
        }
        for (const table of syncTables) {
          const insertSql = buildInsertSql(table);
          for (const row of snapshot.get(table.name) ?? []) {
            this.db.execute(insertSql, valuesForRow(table, row));
          }
        }
      });
    });
  }

  private loadOutboxBatch(): OutboxEvent[] {
    return this.db
      .queryAll(
        `SELECT id, table_name, row_id, operation
         FROM sync_outbox
         ORDER BY id ASC
         LIMIT 50`,
      )
      .map((row) => ({
        id: Number(row.id),
        tableName: String(row.table_name),
        rowId: String(row.row_id),
        operation: String(row.operation) as OutboxOperation,
      }));
  }

  private countPendingOutbox(): number {
    return Number(
      this.db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total ?? 0,
    );
  }

  private async countRemoteBusinessRows(): Promise<number> {
    let total = 0;
    for (const table of syncTables) {
      const result = await this.native.countRows({ table: table.name });
      total += result.total;
    }
    return total;
  }

  private isLocalFreshInstall(): boolean {
    const operationalRows = [
      "customers",
      "rentals",
      "rental_items",
      "inventory_movements",
    ].reduce(
      (total, table) =>
        total +
        Number(
          this.db.queryOne(`SELECT COUNT(*) AS total FROM ${table}`)?.total ?? 0,
        ),
      0,
    );
    const customOrTouchedEquipment = Number(
      this.db.queryOne(
        `SELECT COUNT(*) AS total
         FROM equipment
         WHERE name_normalized NOT IN (${DEFAULT_EQUIPMENT_CATALOG.map(() => "?").join(", ")})
            OR stock_quantity <> 0
            OR archived_at IS NOT NULL`,
        DEFAULT_EQUIPMENT_CATALOG.map((item) => normalizeSearch(item.name)),
      )?.total ?? 0,
    );
    const users = Number(
      this.db.queryOne("SELECT COUNT(*) AS total FROM users")?.total ?? 0,
    );
    const company = this.db.queryOne(
      "SELECT document, street, contact FROM company_settings WHERE id = 'default'",
    );
    const companyLooksDefault =
      !company ||
      [company.document, company.street, company.contact].every((value) =>
        String(value ?? "").toLowerCase().includes("configurar"),
      );
    return (
      operationalRows === 0 &&
      customOrTouchedEquipment === 0 &&
      users <= 1 &&
      companyLooksDefault
    );
  }

  private clearOutboxAndMarkLinked(database: string): void {
    this.db.withOutboxSuppressed(() => {
      this.db.transaction(() => {
        this.db.execute("DELETE FROM sync_outbox");
        this.writeState("linked_a20s_database", database);
      });
    });
  }

  private readState(key: string): string | null {
    const row = this.db.queryOne("SELECT value FROM sync_state WHERE key = ?", [
      key,
    ]);
    return typeof row?.value === "string" ? row.value : null;
  }

  private writeState(key: string, value: string): void {
    this.db.execute(
      `INSERT INTO sync_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    );
  }

  private async refreshLocalStatus(): Promise<void> {
    const publicConfig = await this.refreshStatusBase();
    const pending = this.countPendingOutbox();
    await this.setStatus(
      publicConfig.tokenConfigured
        ? pending > 0
          ? "pending"
          : "offline"
        : "not_configured",
    );
  }

  private async refreshStatusBase(): Promise<A20sSyncPublicConfig> {
    const publicConfig = await this.native.getPublicConfig();
    this.status = {
      ...this.status,
      baseUrl: publicConfig.baseUrl,
      database: publicConfig.database,
      pendingCount: this.countPendingOutbox(),
      lastAttemptAt: this.readState("last_attempt_at"),
      lastSuccessfulSyncAt: this.readState("last_successful_sync_at"),
    };
    return publicConfig;
  }

  private async setStatus(
    state: SyncConnectionState,
    errorCode: string | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    await this.refreshStatusBase();
    this.status = {
      ...this.status,
      state,
      pendingCount: this.countPendingOutbox(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    };
    this.emitStatus();
  }

  private emitStatus(): void {
    const snapshot = this.getStatusSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private getStatusSnapshot(): SyncStatus {
    return { ...this.status, pendingCount: this.countPendingOutbox() };
  }
}

function toAndroidSyncErrorCode(code: string | null): AppErrorCode {
  if (code && androidSyncErrorCodes.has(code as AppErrorCode)) {
    return code as AppErrorCode;
  }
  return "A3-SYNC-001";
}

function buildInsertSql(table: SyncTableMetadata): string {
  return `INSERT INTO ${table.name} (${table.columns.join(", ")})
          VALUES (${table.columns.map(() => "?").join(", ")})`;
}

function valuesForRow(table: SyncTableMetadata, row: DbRow): DbParam[] {
  return table.columns.map((column) => toDbParam(row[column]));
}

function rowToNative(
  table: SyncTableMetadata,
  row: DbRow,
): Record<string, DbParam> {
  return Object.fromEntries(
    table.columns.map((column) => [column, toDbParam(row[column])]),
  );
}

function toDbParam(value: unknown): DbParam {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return String(value);
}

function toAppError(
  error: unknown,
  fallbackCode: AppError["code"] = "A3-SYNC-001",
): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const maybeError = error as { code?: unknown; message?: unknown };
  const code =
    typeof maybeError?.code === "string"
      ? maybeError.code as AppError["code"]
      : fallbackCode;
  const message =
    typeof maybeError?.message === "string"
      ? maybeError.message
      : "Servidor de sincronização indisponível.";
  return new AppError(code, message);
}

function mapErrorToState(
  code: AppError["code"],
  pendingCount: number,
): SyncConnectionState {
  if (code === "A3-SYNC-009") {
    return "not_configured";
  }
  if (pendingCount > 0) {
    return "pending";
  }
  if (code === "A3-SYNC-001") {
    return "offline";
  }
  return "error";
}
