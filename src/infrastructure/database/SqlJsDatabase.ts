import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { migrations } from "./schema";

const requireFromHere = createRequire(__filename);

export type DbRow = Record<string, SqlValue>;
export type DbParam = string | number | null;

export class SqlJsDatabase {
  private constructor(
    private readonly sql: SqlJsStatic,
    private readonly db: Database,
    private readonly filePath: string
  ) {}

  private transactionDepth = 0;

  static async open(filePath: string): Promise<SqlJsDatabase> {
    const wasmPath = resolveWasmPath();
    const sql = await initSqlJs({ locateFile: () => wasmPath });
    const database = fs.existsSync(filePath)
      ? new sql.Database(fs.readFileSync(filePath))
      : new sql.Database();
    const store = new SqlJsDatabase(sql, database, filePath);
    store.db.run("PRAGMA foreign_keys = ON;");
    store.migrate();
    return store;
  }

  static memory(): Promise<SqlJsDatabase> {
    const filePath = path.join(process.cwd(), `.tmp-a3-${randomUUID()}.sqlite`);
    return SqlJsDatabase.open(filePath);
  }

  queryAll(sql: string, params: DbParam[] = []): DbRow[] {
    const statement = this.db.prepare(sql);
    const rows: DbRow[] = [];

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

  queryOne(sql: string, params: DbParam[] = []): DbRow | null {
    return this.queryAll(sql, params)[0] ?? null;
  }

  execute(sql: string, params: DbParam[] = []): void {
    this.db.run(sql, params);
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
      this.queryAll("SELECT id FROM schema_migrations").map((row) => Number(row.id))
    );

    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        continue;
      }
      this.db.run(migration.sql);
      this.db.run("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)", [
        migration.id,
        migration.name,
        new Date().toISOString()
      ]);
    }

    this.persist();
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, Buffer.from(this.db.export()));
  }
}

export function resolveDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, "a3-manager.sqlite");
}

function resolveWasmPath(): string {
  const electronProcess = process as NodeJS.Process & { resourcesPath?: string };
  const resourcePath =
    typeof electronProcess.resourcesPath === "string" ? electronProcess.resourcesPath : "";
  const candidates = [
    resourcePath ? path.join(resourcePath, "sql-wasm.wasm") : "",
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    requireFromHere.resolve("sql.js/dist/sql-wasm.wasm")
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Arquivo sql-wasm.wasm não encontrado para inicializar o SQLite.");
  }

  return found;
}
