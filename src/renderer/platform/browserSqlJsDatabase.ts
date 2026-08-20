import initSqlJs, {
  type Database,
  type SqlJsStatic,
  type SqlValue,
} from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { migrations } from "../../infrastructure/database/schema";

export type BrowserDbRow = Record<string, SqlValue>;
export type BrowserDbParam = string | number | null;

interface BrowserPersistStats {
  sequence: number;
  bytes: number;
  exportDurationMs: number;
  writeDurationMs: number;
  totalDurationMs: number;
}

const defaultDatabaseName = "a3-manager-android.sqlite";
const storeName = "sqlite";

export class BrowserSqlJsDatabase {
  private constructor(
    private readonly sql: SqlJsStatic,
    private readonly db: Database,
    private readonly databaseName: string,
  ) {}

  private transactionDepth = 0;
  private outboxSuppressionDepth = 0;
  private persistSequence = 0;
  private lastPersistStats: BrowserPersistStats | null = null;
  private lastPersistPromise: Promise<void> = Promise.resolve();

  static async open(databaseName = defaultDatabaseName): Promise<BrowserSqlJsDatabase> {
    const sql = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const persisted = await readPersistedDatabase(databaseName);
    const database = persisted ? new sql.Database(persisted) : new sql.Database();
    const store = new BrowserSqlJsDatabase(sql, database, databaseName);
    store.db.run("PRAGMA foreign_keys = ON;");
    store.migrate();
    store.resetOutboxSuppressionFlag();
    return store;
  }

  queryAll(sql: string, params: BrowserDbParam[] = []): BrowserDbRow[] {
    const statement = this.db.prepare(sql);
    const rows: BrowserDbRow[] = [];

    try {
      statement.bind(params);
      while (statement.step()) {
        rows.push(statement.getAsObject());
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  queryOne(sql: string, params: BrowserDbParam[] = []): BrowserDbRow | null {
    return this.queryAll(sql, params)[0] ?? null;
  }

  execute(sql: string, params: BrowserDbParam[] = []): void {
    this.db.run(sql, params);
    if (this.transactionDepth === 0) {
      this.persist();
    }
  }

  executeScript(sql: string): void {
    this.db.run(sql);
    if (this.transactionDepth === 0) {
      this.persist();
    }
  }

  transaction<T>(operation: () => T): T {
    this.db.run("BEGIN IMMEDIATE;");
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.db.run("COMMIT;");
      this.transactionDepth -= 1;
      this.persist();
      return result;
    } catch (error) {
      this.db.run("ROLLBACK;");
      this.transactionDepth -= 1;
      throw error;
    }
  }

  exportBytes(): Uint8Array {
    return this.db.export();
  }

  getLastPersistStats(): BrowserPersistStats | null {
    return this.lastPersistStats ? { ...this.lastPersistStats } : null;
  }

  getFilePath(): string {
    return `indexeddb:${this.databaseName}`;
  }

  createBackup(label: string): string {
    return `indexeddb:${this.databaseName}:${label}:${new Date().toISOString()}`;
  }

  withOutboxSuppressed<T>(operation: () => T): T {
    this.outboxSuppressionDepth += 1;
    if (this.outboxSuppressionDepth === 1) {
      this.setOutboxSuppressionFlag(true);
    }

    try {
      return operation();
    } finally {
      this.outboxSuppressionDepth -= 1;
      if (this.outboxSuppressionDepth === 0) {
        this.setOutboxSuppressionFlag(false);
      }
    }
  }

  flushPersist(): Promise<void> {
    return this.lastPersistPromise;
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      this.queryAll("SELECT id FROM schema_migrations").map((row) => Number(row.id)),
    );

    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        continue;
      }
      this.db.run(migration.sql);
      this.db.run(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
        [migration.id, migration.name, new Date().toISOString()],
      );
    }

    this.persist();
  }

  private setOutboxSuppressionFlag(suppressed: boolean): void {
    this.db.run(
      `INSERT INTO sync_runtime_flags (key, value)
       VALUES ('suppress_outbox', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [suppressed ? "1" : "0"],
    );
  }

  private resetOutboxSuppressionFlag(): void {
    const table = this.queryOne(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_runtime_flags'",
    );
    if (!table) {
      return;
    }
    this.setOutboxSuppressionFlag(false);
  }

  private persist(): void {
    const startedAt = performance.now();
    const exportStartedAt = performance.now();
    const bytes = this.db.export();
    const exportEndedAt = performance.now();
    this.lastPersistPromise = this.lastPersistPromise
      .catch(() => undefined)
      .then(async () => {
        await writePersistedDatabase(this.databaseName, bytes);
        const endedAt = performance.now();
        this.persistSequence += 1;
        this.lastPersistStats = {
          sequence: this.persistSequence,
          bytes: bytes.byteLength,
          exportDurationMs: roundDuration(exportEndedAt - exportStartedAt),
          writeDurationMs: roundDuration(endedAt - exportEndedAt),
          totalDurationMs: roundDuration(endedAt - startedAt),
        };
      });
  }
}

async function readPersistedDatabase(databaseName: string): Promise<Uint8Array | null> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(databaseName);
    request.onsuccess = () => {
      const value = request.result;
      resolve(value instanceof ArrayBuffer ? new Uint8Array(value) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function writePersistedDatabase(
  databaseName: string,
  bytes: Uint8Array,
): Promise<void> {
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(bytes.buffer.slice(0), databaseName);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("a3-manager-android", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}
