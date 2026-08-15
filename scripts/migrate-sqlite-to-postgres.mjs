import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import pg from "pg";

const tables = [
  "users",
  "company_settings",
  "customers",
  "equipment",
  "rentals",
  "rental_items",
  "inventory_movements",
  "schema_migrations"
];

const sqlitePath = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!sqlitePath || !databaseUrl) {
  console.error("Informe o caminho do SQLite e DATABASE_URL para executar a migração.");
  console.error("Exemplo: DATABASE_URL=postgres://... npm run migrate:postgres -- C:\\\\dados\\\\a3-manager.sqlite");
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`Banco SQLite não encontrado: ${sqlitePath}`);
  process.exit(1);
}

const SQL = await initSqlJs({
  locateFile: () => path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm")
});
const sqlite = new SQL.Database(fs.readFileSync(sqlitePath));
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query("BEGIN");
  await ensurePostgresSchema(client);

  for (const table of tables) {
    const rows = selectRows(sqlite, `SELECT * FROM ${table}`);
    for (const row of rows) {
      await insertRow(client, table, row);
    }
    const count = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    if (Number(count.rows[0].total) < rows.length) {
      throw new Error(`Contagem inconsistente após migrar ${table}.`);
    }
  }

  await client.query("COMMIT");
  console.log("Migração concluída e contagens validadas.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
  sqlite.close();
}

function selectRows(database, sql) {
  const statement = database.prepare(sql);
  const rows = [];
  try {
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }
  return rows;
}

async function insertRow(client, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const conflictColumn = table === "schema_migrations" ? "id" : "id";
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})
     ON CONFLICT (${conflictColumn}) DO NOTHING`,
    columns.map((column) => row[column])
  );
}

async function ensurePostgresSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS company_settings (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      document TEXT NOT NULL,
      street TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      number TEXT NOT NULL,
      cep TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      cpf TEXT NOT NULL,
      cpf_normalized TEXT NOT NULL UNIQUE,
      rg TEXT NOT NULL,
      street TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      number TEXT NOT NULL,
      cep TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      contact TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      equipment_value_cents INTEGER NOT NULL CHECK (equipment_value_cents >= 0),
      unit_indemnification_value_cents INTEGER NOT NULL CHECK (unit_indemnification_value_cents >= 0),
      stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rentals (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ONGOING', 'FINALIZED')),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      period TEXT NOT NULL,
      start_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      delivery_street TEXT NOT NULL,
      delivery_neighborhood TEXT NOT NULL,
      delivery_number TEXT NOT NULL,
      delivery_cep TEXT NOT NULL,
      delivery_city TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      receiver_is_customer INTEGER NOT NULL,
      receiver_name TEXT NOT NULL,
      receiver_cpf TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      installments INTEGER,
      customer_name_snapshot TEXT NOT NULL,
      customer_name_snapshot_normalized TEXT NOT NULL,
      customer_snapshot_json TEXT NOT NULL,
      company_snapshot_json TEXT NOT NULL,
      launched_by_username TEXT NOT NULL,
      client_request_id TEXT UNIQUE,
      finalized_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rental_items (
      id TEXT PRIMARY KEY,
      rental_id TEXT NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
      equipment_id TEXT NOT NULL REFERENCES equipment(id),
      name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      equipment_value_cents INTEGER NOT NULL CHECK (equipment_value_cents >= 0),
      unit_indemnification_value_cents INTEGER NOT NULL CHECK (unit_indemnification_value_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      equipment_id TEXT NOT NULL REFERENCES equipment(id),
      rental_id TEXT REFERENCES rentals(id),
      type TEXT NOT NULL CHECK (type IN ('RENTAL_OUT', 'RENTAL_RETURN', 'ADJUSTMENT')),
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT NOT NULL
    );
  `);
}
