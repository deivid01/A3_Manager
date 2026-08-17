import { AppError } from "../../domain/appError";
import type {
  DbParam,
  DbRow,
  SqlJsDatabase,
} from "../database/SqlJsDatabase";
import type { FileLogger } from "../logging/FileLogger";
import { A20sDbClient, type A20sDbClientLike } from "./A20sDbClient";
import {
  A20sConfigStore,
  type EffectiveA20sConfig,
} from "./A20sConfigStore";
import {
  buildRemoteSchemaScript,
  deleteOrder,
  syncTableByName,
  syncTables,
  type SyncTableMetadata,
  type SyncTableName,
} from "./syncTables";
import type {
  A20sSyncConfigInput,
  A20sSyncPublicConfig,
  SyncConnectionState,
  SyncStatus,
  SyncTestResult,
} from "../../shared/contracts";

type OutboxOperation = "INSERT" | "UPDATE" | "DELETE";

interface OutboxEvent {
  id: number;
  tableName: string;
  rowId: string;
  operation: OutboxOperation;
}

interface SyncCoordinatorOptions {
  db: SqlJsDatabase;
  configStore: A20sConfigStore;
  logger?: FileLogger | null;
  createClient?: (config: EffectiveA20sConfig) => A20sDbClientLike;
  intervalMs?: number;
  freshnessMs?: number;
}

const remoteSchemaMarker = "a3_manager_sync_v1";

export class SyncCoordinator {
  private readonly db: SqlJsDatabase;
  private readonly configStore: A20sConfigStore;
  private readonly logger?: FileLogger | null;
  private readonly createClient: (config: EffectiveA20sConfig) => A20sDbClientLike;
  private readonly intervalMs: number;
  private readonly freshnessMs: number;
  private status: SyncStatus;
  private syncInFlight: Promise<SyncStatus> | null = null;
  private interval: NodeJS.Timeout | null = null;
  private lastFreshnessAttemptAt = 0;
  private listeners = new Set<(status: SyncStatus) => void>();

  constructor(options: SyncCoordinatorOptions) {
    this.db = options.db;
    this.configStore = options.configStore;
    this.logger = options.logger;
    this.createClient =
      options.createClient ??
      ((config) =>
        new A20sDbClient({
          baseUrl: config.baseUrl,
          database: config.database,
          token: config.token,
        }));
    this.intervalMs = options.intervalMs ?? 45_000;
    this.freshnessMs = options.freshnessMs ?? 10_000;
    this.status = this.buildStatus(
      this.configStore.getPublicConfig().tokenConfigured
        ? "offline"
        : "not_configured",
    );
  }

  start(): void {
    this.refreshLocalStatus();
    void this.requestSync("startup");
    this.interval = setInterval(() => {
      void this.requestSync("interval");
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    this.status = {
      ...this.status,
      ...this.statusBase(),
      pendingCount: this.countPendingOutbox(),
    };
    return { ...this.status };
  }

  getPublicConfig(): A20sSyncPublicConfig {
    return this.configStore.getPublicConfig();
  }

  saveConfig(input: A20sSyncConfigInput): A20sSyncPublicConfig {
    const result = this.configStore.save(input);
    this.refreshLocalStatus();
    void this.requestSync("config_saved");
    return result;
  }

  async testConnection(input: A20sSyncConfigInput): Promise<SyncTestResult> {
    let health = false;
    let authenticated = false;
    let databaseFound = false;

    try {
      const config = this.configStore.loadEffectiveConfig(input);
      const client = this.createClient(config);
      await client.health();
      health = true;
      const databases = await client.listDatabases();
      authenticated = true;
      databaseFound = databases.databases.some(
        (database) => database.name === config.database,
      );
      return {
        ok: databaseFound,
        health,
        authenticated,
        databaseFound,
        message: databaseFound
          ? "Conexão com o A20s confirmada."
          : `Banco ${config.database} não encontrado no A20s.`,
      };
    } catch (error) {
      return {
        ok: false,
        health,
        authenticated,
        databaseFound,
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível testar o A20s.",
      };
    }
  }

  notifyLocalMutation(): void {
    const pending = this.countPendingOutbox();
    this.setStatus(pending > 0 ? "pending" : "offline");
    void this.requestSync("local_mutation");
  }

  requestFreshData(): void {
    const now = Date.now();
    if (now - this.lastFreshnessAttemptAt < this.freshnessMs) {
      return;
    }
    this.lastFreshnessAttemptAt = now;
    void this.requestSync("freshness");
  }

  syncNow(): Promise<SyncStatus> {
    return this.requestSync("manual");
  }

  private requestSync(reason: string): Promise<SyncStatus> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.runSync(reason).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private async runSync(reason: string): Promise<SyncStatus> {
    this.setStatus("syncing");
    const attemptedAt = new Date().toISOString();
    this.writeState("last_attempt_at", attemptedAt);

    try {
      const config = this.configStore.loadEffectiveConfig();
      const client = this.createClient(config);
      await client.health();
      await this.assertRemoteDatabaseExists(client, config.database);
      const initialized = await this.ensureRemoteInitialization(client);

      if (!initialized.completedInitialSync) {
        await this.flushOutbox(client);
        if (this.countPendingOutbox() === 0) {
          await this.pullRemoteSnapshot(client);
        }
      }

      const syncedAt = new Date().toISOString();
      this.writeState("last_successful_sync_at", syncedAt);
      this.writeState("linked_a20s_database", config.database);
      this.logger?.info("sync_completed", {
        reason,
        database: config.database,
        pendingCount: this.countPendingOutbox(),
      });
      this.setStatus("online");
      return this.getStatus();
    } catch (error) {
      const appError = toSyncAppError(error);
      const pending = this.countPendingOutbox();
      const state = mapErrorToState(appError.code, pending);
      this.logger?.error("sync_failed", appError, {
        reason,
        code: appError.code,
        pendingCount: pending,
      });
      this.setStatus(state, appError.code, appError.message);
      return this.getStatus();
    }
  }

  private async assertRemoteDatabaseExists(
    client: A20sDbClientLike,
    databaseName: string,
  ): Promise<void> {
    const databases = await client.listDatabases();
    if (!databases.databases.some((database) => database.name === databaseName)) {
      throw new AppError(
        "A3-SYNC-003",
        `Banco remoto ${databaseName} não encontrado no A20s.`,
      );
    }
  }

  private async ensureRemoteInitialization(
    client: A20sDbClientLike,
  ): Promise<{ completedInitialSync: boolean }> {
    const remoteTables = await this.listRemoteTables(client);
    const hasMarker = remoteTables.includes("a3_sync_metadata");
    const hasBusinessTables = syncTables.some((table) =>
      remoteTables.includes(table.name),
    );

    if (!hasMarker && !hasBusinessTables) {
      const backupPath = this.db.createBackup("before-a20s-bootstrap");
      await client.script(buildRemoteSchemaScript());
      await this.bootstrapRemoteFromLocal(client, backupPath);
      return { completedInitialSync: true };
    }

    if (!hasMarker) {
      await this.verifyRemoteSchema(client);
      const remoteRows = await this.countRemoteBusinessRows(client);
      if (remoteRows > 0) {
        throw new AppError(
          "A3-SYNC-007",
          "O banco remoto já possui dados A3 sem vínculo de sincronização.",
        );
      }
      const backupPath = this.db.createBackup("before-a20s-bootstrap");
      await this.createRemoteMarker(client);
      await this.bootstrapRemoteFromLocal(client, backupPath);
      return { completedInitialSync: true };
    }

    await this.assertRemoteMarker(client);
    await this.verifyRemoteSchema(client);

    if (!this.isLinkedToCurrentRemote()) {
      if (!this.isLocalFreshInstall()) {
        throw new AppError(
          "A3-SYNC-007",
          "Local e remoto possuem dados sem vínculo conhecido. A sincronização automática foi bloqueada.",
        );
      }
      const remoteRows = await this.countRemoteBusinessRows(client);
      if (remoteRows === 0) {
        const backupPath = this.db.createBackup("before-a20s-bootstrap");
        await this.bootstrapRemoteFromLocal(client, backupPath);
        return { completedInitialSync: true };
      }
      this.clearOutboxAndMarkLinked();
      await this.pullRemoteSnapshot(client);
      return { completedInitialSync: true };
    }

    return { completedInitialSync: false };
  }

  private async listRemoteTables(client: A20sDbClientLike): Promise<string[]> {
    const result = await client.query<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN (${[
           ...syncTables.map((table) => `'${table.name}'`),
           "'a3_sync_metadata'",
         ].join(", ")})
       ORDER BY name`,
    );
    return result.rows.map((row) => String(row.name));
  }

  private async assertRemoteMarker(client: A20sDbClientLike): Promise<void> {
    const result = await client.query<{ value: string }>(
      "SELECT value FROM a3_sync_metadata WHERE key = ? LIMIT 1",
      ["schema"],
    );
    if (result.rows[0]?.value !== remoteSchemaMarker) {
      throw new AppError(
        "A3-SYNC-004",
        "Marcador de schema remoto incompatível.",
      );
    }
  }

  private async createRemoteMarker(client: A20sDbClientLike): Promise<void> {
    await client.script(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS a3_sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO a3_sync_metadata (key, value, updated_at)
      VALUES ('schema', '${remoteSchemaMarker}', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;
      COMMIT;
    `);
  }

  private async verifyRemoteSchema(client: A20sDbClientLike): Promise<void> {
    for (const table of syncTables) {
      const result = await client.query<{ name: string }>(
        `PRAGMA table_info(${table.name})`,
      );
      const remoteColumns = new Set(result.rows.map((row) => String(row.name)));
      const missing = table.columns.filter((column) => !remoteColumns.has(column));
      if (missing.length > 0) {
        throw new AppError(
          "A3-SYNC-004",
          `Schema remoto incompatível em ${table.name}: ${missing.join(", ")}.`,
        );
      }
    }
  }

  private async bootstrapRemoteFromLocal(
    client: A20sDbClientLike,
    backupPath: string,
  ): Promise<void> {
    for (const table of syncTables) {
      const rows = this.db.queryAll(
        `SELECT ${table.columns.join(", ")} FROM ${table.name} ORDER BY ${table.primaryKey}`,
      );
      for (const row of rows) {
        await client.execute(buildUpsertSql(table), valuesForRow(table, row));
      }
    }

    this.db.withOutboxSuppressed(() => {
      this.db.transaction(() => {
        this.db.execute("DELETE FROM sync_outbox");
        this.writeState("linked_a20s_database", this.getPublicConfig().database);
        this.writeState("last_bootstrap_backup_path", backupPath);
      });
    });
    this.logger?.info("sync_bootstrap_completed", {
      backupPath,
      pendingCount: this.countPendingOutbox(),
    });
  }

  private async flushOutbox(client: A20sDbClientLike): Promise<void> {
    while (true) {
      const events = this.loadOutboxBatch();
      if (events.length === 0) {
        return;
      }

      for (const event of events) {
        try {
          await this.pushOutboxEvent(client, event);
          this.db.execute("DELETE FROM sync_outbox WHERE id = ?", [event.id]);
        } catch (error) {
          const appError = toSyncAppError(error, "A3-SYNC-005");
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

  private async pushOutboxEvent(
    client: A20sDbClientLike,
    event: OutboxEvent,
  ): Promise<void> {
    const table = syncTableByName.get(event.tableName as SyncTableName);
    if (!table) {
      throw new AppError(
        "A3-SYNC-005",
        `Tabela não permitida no outbox: ${event.tableName}.`,
      );
    }

    if (event.operation === "DELETE") {
      await client.execute(`DELETE FROM ${table.name} WHERE ${table.primaryKey} = ?`, [
        event.rowId,
      ]);
      return;
    }

    const row = this.db.queryOne(
      `SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE ${table.primaryKey} = ?`,
      [event.rowId],
    );
    if (!row) {
      return;
    }

    await client.execute(buildUpsertSql(table), valuesForRow(table, row));
  }

  private async pullRemoteSnapshot(client: A20sDbClientLike): Promise<void> {
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
        const result = await client.query<DbRow>(
          `SELECT ${table.columns.join(", ")}
           FROM ${table.name}
           ORDER BY ${table.primaryKey}
           LIMIT ? OFFSET ?`,
          [500, offset],
        );
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
        this.writeState("linked_a20s_database", this.getPublicConfig().database);
      });
    });
  }

  private async countRemoteBusinessRows(client: A20sDbClientLike): Promise<number> {
    let total = 0;
    for (const table of syncTables) {
      const result = await client.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${table.name}`,
      );
      total += Number(result.rows[0]?.total ?? 0);
    }
    return total;
  }

  private isLinkedToCurrentRemote(): boolean {
    return this.readState("linked_a20s_database") === this.getPublicConfig().database;
  }

  private isLocalFreshInstall(): boolean {
    const operationalRows = [
      "customers",
      "equipment",
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
    return operationalRows === 0 && users <= 1 && companyLooksDefault;
  }

  private clearOutboxAndMarkLinked(): void {
    this.db.withOutboxSuppressed(() => {
      this.db.transaction(() => {
        this.db.execute("DELETE FROM sync_outbox");
        this.writeState("linked_a20s_database", this.getPublicConfig().database);
      });
    });
  }

  private countPendingOutbox(): number {
    return Number(
      this.db.queryOne("SELECT COUNT(*) AS total FROM sync_outbox")?.total ?? 0,
    );
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

  private refreshLocalStatus(): void {
    const publicConfig = this.configStore.getPublicConfig();
    const pending = this.countPendingOutbox();
    this.setStatus(
      publicConfig.tokenConfigured
        ? pending > 0
          ? "pending"
          : "offline"
        : "not_configured",
    );
  }

  private setStatus(
    state: SyncConnectionState,
    errorCode: string | null = null,
    errorMessage: string | null = null,
  ): void {
    this.status = {
      ...this.status,
      ...this.statusBase(),
      state,
      pendingCount: this.countPendingOutbox(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    };
    this.emitStatus();
  }

  private statusBase(): Pick<
    SyncStatus,
    "baseUrl" | "database" | "lastAttemptAt" | "lastSuccessfulSyncAt"
  > {
    const publicConfig = this.configStore.getPublicConfig();
    return {
      baseUrl: publicConfig.baseUrl,
      database: publicConfig.database,
      lastAttemptAt: this.readState("last_attempt_at"),
      lastSuccessfulSyncAt: this.readState("last_successful_sync_at"),
    };
  }

  private buildStatus(state: SyncConnectionState): SyncStatus {
    return {
      state,
      ...this.statusBase(),
      pendingCount: this.countPendingOutbox(),
      lastErrorCode: null,
      lastErrorMessage: null,
    };
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

function buildInsertSql(table: SyncTableMetadata): string {
  return `INSERT INTO ${table.name} (${table.columns.join(", ")})
          VALUES (${table.columns.map(() => "?").join(", ")})`;
}

function buildUpsertSql(table: SyncTableMetadata): string {
  const updateColumns = table.columns
    .filter((column) => column !== table.primaryKey)
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  return `${buildInsertSql(table)}
          ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updateColumns}`;
}

function valuesForRow(table: SyncTableMetadata, row: DbRow): DbParam[] {
  return table.columns.map((column) => toDbParam(row[column]));
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

function toSyncAppError(
  error: unknown,
  fallbackCode: AppError["code"] = "A3-SYNC-001",
): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(fallbackCode, message);
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
