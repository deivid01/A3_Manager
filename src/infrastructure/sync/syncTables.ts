import { migrations } from "../database/schema";

export const remoteMigrations = migrations.filter(
  (migration) => migration.id !== 3,
);

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
      "name",
      "name_normalized",
      "cpf",
      "cpf_normalized",
      "rg",
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
    .map(
      (migration) => `
        ${migration.sql}
        INSERT OR IGNORE INTO schema_migrations (id, name, applied_at)
        VALUES (${migration.id}, ${sqlLiteral(migration.name)}, CURRENT_TIMESTAMP);
      `,
    )
    .join("\n");

  return `
    BEGIN;
    ${migrationScript}
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

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
