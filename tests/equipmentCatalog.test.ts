import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_EQUIPMENT_CATALOG } from "../src/domain/equipmentCatalog";
import { normalizeSearch } from "../src/domain/normalization";
import { SqlJsDatabase } from "../src/infrastructure/database/SqlJsDatabase";
import { migrations } from "../src/infrastructure/database/schema";
import { createTestService } from "./helpers";

describe("catálogo padrão de equipamentos", () => {
  it("semeia os equipamentos padrão em banco novo com estoque zerado", async () => {
    const { db } = await createTestService();
    const names = DEFAULT_EQUIPMENT_CATALOG.map((item) => normalizeSearch(item.name));
    const placeholders = names.map(() => "?").join(", ");
    const row = db.queryOne(
      `SELECT COUNT(*) AS total, SUM(stock_quantity) AS stock
       FROM equipment
       WHERE name_normalized IN (${placeholders})`,
      names,
    );
    const andaimes = db.queryOne(
      "SELECT * FROM equipment WHERE name_normalized = ?",
      [normalizeSearch("ANDAIMES")],
    );
    db.close();

    expect(Number(row?.total)).toBe(DEFAULT_EQUIPMENT_CATALOG.length);
    expect(Number(row?.stock)).toBe(0);
    expect(andaimes).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      daily_rate_cents: 900,
      weekly_rate_cents: 1000,
      biweekly_rate_cents: 1100,
      monthly_rate_cents: 1200,
      unit_indemnification_value_cents: 23000,
    });
  });

  it("migra catálogo legado sem duplicar item padrão nem apagar customização", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3-catalog-migration-"));
    const dbPath = path.join(dir, "a3-manager.sqlite");
    const sql = await initSqlJs({
      locateFile: () => path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    });
    const legacyDb = new sql.Database();
    const now = "2026-08-17T00:00:00.000Z";

    for (const migration of migrations.filter((item) => item.id < 4)) {
      legacyDb.run(migration.sql);
      legacyDb.run(
        "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
        [migration.id, migration.name, now],
      );
    }

    legacyDb.run(
      `INSERT INTO equipment
        (id, name, name_normalized, equipment_value_cents,
         unit_indemnification_value_cents, stock_quantity,
         archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        "legacy-andaimes",
        "ANDAIMES",
        normalizeSearch("ANDAIMES"),
        99999,
        88888,
        7,
        now,
        now,
      ],
    );
    legacyDb.run(
      `INSERT INTO equipment
        (id, name, name_normalized, equipment_value_cents,
         unit_indemnification_value_cents, stock_quantity,
         archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        "custom-equipment",
        "Escora Especial",
        normalizeSearch("Escora Especial"),
        12345,
        54321,
        4,
        now,
        now,
      ],
    );
    fs.writeFileSync(dbPath, Buffer.from(legacyDb.export()));
    legacyDb.close();

    const migrated = await SqlJsDatabase.open(dbPath);
    const defaultNames = DEFAULT_EQUIPMENT_CATALOG.map((item) => normalizeSearch(item.name));
    const placeholders = defaultNames.map(() => "?").join(", ");
    const totalDefault = migrated.queryOne(
      `SELECT COUNT(*) AS total FROM equipment WHERE name_normalized IN (${placeholders})`,
      defaultNames,
    );
    const andaimes = migrated.queryOne(
      "SELECT * FROM equipment WHERE id = ?",
      ["legacy-andaimes"],
    );
    const custom = migrated.queryOne(
      "SELECT * FROM equipment WHERE id = ?",
      ["custom-equipment"],
    );
    migrated.close();

    expect(Number(totalDefault?.total)).toBe(DEFAULT_EQUIPMENT_CATALOG.length);
    expect(andaimes).toMatchObject({
      daily_rate_cents: 900,
      weekly_rate_cents: 1000,
      biweekly_rate_cents: 1100,
      monthly_rate_cents: 1200,
      unit_indemnification_value_cents: 23000,
      stock_quantity: 7,
    });
    expect(custom).toMatchObject({
      daily_rate_cents: 12345,
      weekly_rate_cents: 12345,
      biweekly_rate_cents: 12345,
      monthly_rate_cents: 12345,
      unit_indemnification_value_cents: 54321,
      stock_quantity: 4,
    });
  });
});
