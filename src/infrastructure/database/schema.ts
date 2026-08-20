import { DEFAULT_EQUIPMENT_CATALOG } from "../../domain/equipmentCatalog";
import { normalizeSearch } from "../../domain/normalization";

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
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
        customer_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
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
        finalized_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS rental_items (
        id TEXT PRIMARY KEY,
        rental_id TEXT NOT NULL,
        equipment_id TEXT NOT NULL,
        name_snapshot TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        equipment_value_cents INTEGER NOT NULL CHECK (equipment_value_cents >= 0),
        unit_indemnification_value_cents INTEGER NOT NULL CHECK (unit_indemnification_value_cents >= 0),
        FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE CASCADE,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id)
      );

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        equipment_id TEXT NOT NULL,
        rental_id TEXT,
        type TEXT NOT NULL CHECK (type IN ('RENTAL_OUT', 'RENTAL_RETURN', 'ADJUSTMENT')),
        quantity INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        note TEXT NOT NULL,
        FOREIGN KEY (equipment_id) REFERENCES equipment(id),
        FOREIGN KEY (rental_id) REFERENCES rentals(id)
      );

      CREATE INDEX IF NOT EXISTS idx_customers_name_normalized ON customers(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_customers_cpf_normalized ON customers(cpf_normalized);
      CREATE INDEX IF NOT EXISTS idx_equipment_name_normalized ON equipment(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_rentals_code ON rentals(code);
      CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);
      CREATE INDEX IF NOT EXISTS idx_rentals_start_date ON rentals(start_date);
      CREATE INDEX IF NOT EXISTS idx_rentals_return_date ON rentals(return_date);
      CREATE INDEX IF NOT EXISTS idx_rentals_created_at ON rentals(created_at);
      CREATE INDEX IF NOT EXISTS idx_rentals_customer_name_snapshot ON rentals(customer_name_snapshot_normalized);
      CREATE INDEX IF NOT EXISTS idx_rental_items_rental_id ON rental_items(rental_id);
    `
  },
  {
    id: 2,
    name: "rental_launch_idempotency",
    sql: `
      ALTER TABLE rentals ADD COLUMN client_request_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rentals_client_request_id
        ON rentals(client_request_id)
        WHERE client_request_id IS NOT NULL;
    `
  },
  {
    id: 3,
    name: "local_sync_outbox",
    sql: `
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        table_name TEXT NOT NULL,
        row_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runtime_flags (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO sync_runtime_flags (key, value)
      VALUES ('suppress_outbox', '0');

      CREATE INDEX IF NOT EXISTS idx_sync_outbox_created_at
        ON sync_outbox(created_at, id);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_table_row
        ON sync_outbox(table_name, row_id);

      CREATE TRIGGER IF NOT EXISTS trg_sync_users_insert
      AFTER INSERT ON users
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'users', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_users_update
      AFTER UPDATE ON users
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'users', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_users_delete
      AFTER DELETE ON users
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'users', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_company_settings_insert
      AFTER INSERT ON company_settings
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'company_settings', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_company_settings_update
      AFTER UPDATE ON company_settings
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'company_settings', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_company_settings_delete
      AFTER DELETE ON company_settings
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'company_settings', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_insert
      AFTER INSERT ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_update
      AFTER UPDATE ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_delete
      AFTER DELETE ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_equipment_insert
      AFTER INSERT ON equipment
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'equipment', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_equipment_update
      AFTER UPDATE ON equipment
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'equipment', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_equipment_delete
      AFTER DELETE ON equipment
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'equipment', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rentals_insert
      AFTER INSERT ON rentals
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rentals', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rentals_update
      AFTER UPDATE ON rentals
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rentals', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rentals_delete
      AFTER DELETE ON rentals
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rentals', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rental_items_insert
      AFTER INSERT ON rental_items
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rental_items', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rental_items_update
      AFTER UPDATE ON rental_items
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rental_items', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_rental_items_delete
      AFTER DELETE ON rental_items
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'rental_items', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_inventory_movements_insert
      AFTER INSERT ON inventory_movements
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'inventory_movements', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_inventory_movements_update
      AFTER UPDATE ON inventory_movements
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'inventory_movements', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_inventory_movements_delete
      AFTER DELETE ON inventory_movements
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'inventory_movements', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
    `
  },
  {
    id: 4,
    name: "rental_period_pricing_catalog_and_archives",
    sql: buildRentalPeriodPricingCatalogAndArchivesSql(),
  },
  {
    id: 5,
    name: "customer_pf_pj_identity",
    sql: buildCustomerPfPjIdentitySql(),
  },
  {
    id: 6,
    name: "recreate_customer_outbox_triggers",
    sql: buildCustomerOutboxTriggersSql(),
  }
];

function buildRentalPeriodPricingCatalogAndArchivesSql(): string {
  return `
      ALTER TABLE equipment ADD COLUMN daily_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (daily_rate_cents >= 0);
      ALTER TABLE equipment ADD COLUMN weekly_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (weekly_rate_cents >= 0);
      ALTER TABLE equipment ADD COLUMN biweekly_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (biweekly_rate_cents >= 0);
      ALTER TABLE equipment ADD COLUMN monthly_rate_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_rate_cents >= 0);

      UPDATE equipment
      SET
        daily_rate_cents = equipment_value_cents,
        weekly_rate_cents = equipment_value_cents,
        biweekly_rate_cents = equipment_value_cents,
        monthly_rate_cents = equipment_value_cents;

      ${DEFAULT_EQUIPMENT_CATALOG.map(buildDefaultEquipmentUpdateSql).join("\n")}
      ${DEFAULT_EQUIPMENT_CATALOG.map(buildDefaultEquipmentInsertSql).join("\n")}

      ALTER TABLE rental_items ADD COLUMN unit_rental_rate_cents INTEGER CHECK (unit_rental_rate_cents >= 0);

      UPDATE rental_items
      SET unit_rental_rate_cents = equipment_value_cents
      WHERE unit_rental_rate_cents IS NULL;

      ALTER TABLE rentals ADD COLUMN archived_at TEXT;
      ALTER TABLE rentals ADD COLUMN archived_by_user_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_rentals_archived_at ON rentals(archived_at);
    `;
}

function buildDefaultEquipmentUpdateSql(
  item: (typeof DEFAULT_EQUIPMENT_CATALOG)[number],
): string {
  return `
      UPDATE equipment
      SET
        daily_rate_cents = ${item.dailyRateCents},
        weekly_rate_cents = ${item.weeklyRateCents},
        biweekly_rate_cents = ${item.biweeklyRateCents},
        monthly_rate_cents = ${item.monthlyRateCents},
        unit_indemnification_value_cents = ${item.unitIndemnificationValueCents},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE name_normalized = ${sqlLiteral(normalizeSearch(item.name))};
    `;
}

function buildDefaultEquipmentInsertSql(
  item: (typeof DEFAULT_EQUIPMENT_CATALOG)[number],
): string {
  return `
      INSERT INTO equipment
        (id, name, name_normalized, equipment_value_cents, daily_rate_cents,
         weekly_rate_cents, biweekly_rate_cents, monthly_rate_cents,
         unit_indemnification_value_cents, stock_quantity, archived_at,
         created_at, updated_at)
      SELECT
        ${sqlLiteral(item.id)},
        ${sqlLiteral(item.name)},
        ${sqlLiteral(normalizeSearch(item.name))},
        ${item.monthlyRateCents},
        ${item.dailyRateCents},
        ${item.weeklyRateCents},
        ${item.biweeklyRateCents},
        ${item.monthlyRateCents},
        ${item.unitIndemnificationValueCents},
        0,
        NULL,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE NOT EXISTS (
        SELECT 1 FROM equipment
        WHERE id = ${sqlLiteral(item.id)}
           OR name_normalized = ${sqlLiteral(normalizeSearch(item.name))}
      );
    `;
}

function buildCustomerPfPjIdentitySql(): string {
  return `
      PRAGMA foreign_keys = OFF;

      DROP TABLE IF EXISTS customers_v5;
      CREATE TABLE customers_v5 (
        id TEXT PRIMARY KEY,
        customer_type TEXT NOT NULL DEFAULT 'PF' CHECK (customer_type IN ('PF', 'PJ')),
        name TEXT NOT NULL DEFAULT '',
        name_normalized TEXT NOT NULL DEFAULT '',
        cpf TEXT NOT NULL DEFAULT '',
        cpf_normalized TEXT,
        rg TEXT NOT NULL DEFAULT '',
        legal_name TEXT,
        legal_name_normalized TEXT,
        trade_name TEXT,
        trade_name_normalized TEXT,
        cnpj TEXT,
        cnpj_normalized TEXT,
        state_registration TEXT,
        street TEXT NOT NULL DEFAULT '',
        neighborhood TEXT NOT NULL DEFAULT '',
        number TEXT NOT NULL DEFAULT '',
        cep TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        contact TEXT NOT NULL DEFAULT '',
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO customers_v5
        (id, customer_type, name, name_normalized, cpf, cpf_normalized, rg,
         legal_name, legal_name_normalized, trade_name, trade_name_normalized,
         cnpj, cnpj_normalized, state_registration, street, neighborhood,
         number, cep, city, state, contact, archived_at, created_at, updated_at)
      SELECT
        id,
        'PF',
        name,
        name_normalized,
        cpf,
        NULLIF(cpf_normalized, ''),
        rg,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        street,
        neighborhood,
        number,
        cep,
        city,
        state,
        contact,
        archived_at,
        created_at,
        updated_at
      FROM customers;

      DROP TABLE customers;
      ALTER TABLE customers_v5 RENAME TO customers;

      CREATE INDEX IF NOT EXISTS idx_customers_name_normalized ON customers(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_customers_cpf_normalized ON customers(cpf_normalized);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_cpf_unique
        ON customers(cpf_normalized)
        WHERE cpf_normalized IS NOT NULL AND cpf_normalized <> '';
      CREATE INDEX IF NOT EXISTS idx_customers_legal_name_normalized
        ON customers(legal_name_normalized);
      CREATE INDEX IF NOT EXISTS idx_customers_trade_name_normalized
        ON customers(trade_name_normalized);
      CREATE INDEX IF NOT EXISTS idx_customers_cnpj_normalized
        ON customers(cnpj_normalized);

      PRAGMA foreign_keys = ON;
    `;
}

function buildCustomerOutboxTriggersSql(): string {
  return `
      DROP TRIGGER IF EXISTS trg_sync_customers_insert;
      DROP TRIGGER IF EXISTS trg_sync_customers_update;
      DROP TRIGGER IF EXISTS trg_sync_customers_delete;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_insert
      AFTER INSERT ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'INSERT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_update
      AFTER UPDATE ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', NEW.id, 'UPDATE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;

      CREATE TRIGGER IF NOT EXISTS trg_sync_customers_delete
      AFTER DELETE ON customers
      WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') <> '1'
      BEGIN
        INSERT INTO sync_outbox (event_id, table_name, row_id, operation, created_at)
        VALUES (lower(hex(randomblob(16))), 'customers', OLD.id, 'DELETE', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
      END;
    `;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
