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
  }
];
