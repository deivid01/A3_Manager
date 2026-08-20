import { migrations, type Migration } from "../database/schema";

export interface RemoteMigration extends Migration {
  requiresForeignKeysDisabled?: boolean;
}

export const remoteMigrations: RemoteMigration[] = migrations
  .filter((migration) => migration.id !== 3)
  .map((migration) => {
    if (migration.id === 5) {
      return { ...migration, requiresForeignKeysDisabled: true };
    }

    if (migration.id === 6) {
      return {
        ...migration,
        // Remote databases do not own local outbox tables used by these triggers.
        sql: "",
      };
    }

    return migration;
  });

export type SyncTableName =
  | "users"
  | "company_settings"
  | "customers"
  | "equipment"
  | "rentals"
  | "rental_items"
  | "inventory_movements";

export interface SyncTableMetadata {
  name: SyncTableName;
  primaryKey: "id";
  columns: string[];
}

export const syncTables: SyncTableMetadata[] = [
  {
    name: "users",
    primaryKey: "id",
    columns: [
      "id",
      "username",
      "username_normalized",
      "password_hash",
      "role",
      "active",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "company_settings",
    primaryKey: "id",
    columns: [
      "id",
      "legal_name",
      "trade_name",
      "document",
      "street",
      "neighborhood",
      "number",
      "cep",
      "city",
      "state",
      "contact",
      "email",
      "updated_at",
    ],
  },
  {
    name: "customers",
    primaryKey: "id",
    columns: [
      "id",
      "customer_type",
      "name",
      "name_normalized",
      "cpf",
      "cpf_normalized",
      "rg",
      "legal_name",
      "legal_name_normalized",
      "trade_name",
      "trade_name_normalized",
      "cnpj",
      "cnpj_normalized",
      "state_registration",
      "street",
      "neighborhood",
      "number",
      "cep",
      "city",
      "state",
      "contact",
      "archived_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "equipment",
    primaryKey: "id",
    columns: [
      "id",
      "name",
      "name_normalized",
      "equipment_value_cents",
      "daily_rate_cents",
      "weekly_rate_cents",
      "biweekly_rate_cents",
      "monthly_rate_cents",
      "unit_indemnification_value_cents",
      "stock_quantity",
      "archived_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "rentals",
    primaryKey: "id",
    columns: [
      "id",
      "code",
      "status",
      "customer_id",
      "user_id",
      "period",
      "start_date",
      "return_date",
      "delivery_street",
      "delivery_neighborhood",
      "delivery_number",
      "delivery_cep",
      "delivery_city",
      "delivery_state",
      "receiver_is_customer",
      "receiver_name",
      "receiver_cpf",
      "payment_method",
      "installments",
      "customer_name_snapshot",
      "customer_name_snapshot_normalized",
      "customer_snapshot_json",
      "company_snapshot_json",
      "launched_by_username",
      "finalized_at",
      "archived_at",
      "archived_by_user_id",
      "created_at",
      "updated_at",
      "client_request_id",
    ],
  },
  {
    name: "rental_items",
    primaryKey: "id",
    columns: [
      "id",
      "rental_id",
      "equipment_id",
      "name_snapshot",
      "quantity",
      "equipment_value_cents",
      "unit_rental_rate_cents",
      "unit_indemnification_value_cents",
    ],
  },
  {
    name: "inventory_movements",
    primaryKey: "id",
    columns: [
      "id",
      "equipment_id",
      "rental_id",
      "type",
      "quantity",
      "created_at",
      "note",
    ],
  },
];

export const syncTableByName = new Map(
  syncTables.map((table) => [table.name, table]),
);

export const deleteOrder = [...syncTables].reverse();

export function buildRemoteSchemaScript(): string {
  const migrationScript = remoteMigrations
    .map((migration) => buildRemoteMigrationScript(migration))
    .join("\n");

  return `
    ${migrationScript}
    BEGIN;
    CREATE TABLE IF NOT EXISTS a3_sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO a3_sync_metadata (key, value, updated_at)
    VALUES ('schema', 'a3_manager_sync_v1', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at;
    COMMIT;
  `;
}

export function buildRemoteMigrationScript(migration: RemoteMigration): string {
  const migrationSql = migration.requiresForeignKeysDisabled
    ? withoutForeignKeyPragmas(migration.sql)
    : migration.sql;
  const body = migrationSql.trim();

  return `
    ${migration.requiresForeignKeysDisabled ? "PRAGMA foreign_keys = OFF;" : ""}
    BEGIN;
    ${body ? `${body}\n` : ""}
    ${buildForeignKeyCheckGuardSql()}
    INSERT OR IGNORE INTO schema_migrations (id, name, applied_at)
    VALUES (${migration.id}, ${sqlLiteral(migration.name)}, CURRENT_TIMESTAMP);
    COMMIT;
    ${migration.requiresForeignKeysDisabled ? "PRAGMA foreign_keys = ON;" : ""}
  `;
}

function buildForeignKeyCheckGuardSql(): string {
  return `
    CREATE TEMP TABLE IF NOT EXISTS a3_remote_fk_check_guard (
      violation_count INTEGER NOT NULL CHECK (violation_count = 0)
    );
    DELETE FROM a3_remote_fk_check_guard;
    INSERT INTO a3_remote_fk_check_guard (violation_count)
    SELECT COUNT(*) FROM pragma_foreign_key_check;
    DROP TABLE a3_remote_fk_check_guard;
  `;
}

function withoutForeignKeyPragmas(sql: string): string {
  return sql.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*(?:ON|OFF)\s*;\s*$/gim, "");
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
