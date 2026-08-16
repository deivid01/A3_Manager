import { randomUUID } from "node:crypto";
import { normalizeSearch } from "../../domain/normalization";
import type { Equipment, EquipmentSearchResult } from "../../domain/types";
import type {
  DbParam,
  SqlJsDatabase,
} from "../../infrastructure/database/SqlJsDatabase";
import {
  equipmentInputSchema,
  type EquipmentInput,
} from "../../shared/contracts";
import { mapEquipment } from "../rowMappers";
import { mustFind, parseInput } from "../serviceHelpers";

export class EquipmentApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  list(search: string): Equipment[] {
    const normalized = normalizeSearch(search);
    const params: DbParam[] = [];
    let where = "archived_at IS NULL";
    if (normalized) {
      const nameWhere = buildNameSearchWhere(normalized, params, 1);
      if (nameWhere) where += ` AND ${nameWhere}`;
    }
    return this.db
      .queryAll(
        `SELECT * FROM equipment WHERE ${where} ORDER BY name_normalized ASC LIMIT 100`,
        params,
      )
      .map(mapEquipment);
  }

  search(search: string): EquipmentSearchResult[] {
    const normalized = normalizeSearch(search);
    if (normalized.length < 2) return [];
    const params: DbParam[] = [];
    const nameWhere = buildNameSearchWhere(normalized, params, 2);
    if (!nameWhere) return [];
    return this.db
      .queryAll(
        `SELECT id, name, stock_quantity, equipment_value_cents, unit_indemnification_value_cents
       FROM equipment WHERE archived_at IS NULL AND ${nameWhere}
       ORDER BY name_normalized ASC LIMIT 10`,
        params,
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        stockQuantity: Number(row.stock_quantity),
        equipmentValueCents: Number(row.equipment_value_cents),
        unitIndemnificationValueCents: Number(
          row.unit_indemnification_value_cents,
        ),
      }));
  }

  create(input: EquipmentInput): Equipment {
    const data = parseInput(equipmentInputSchema, input);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.execute(
      `INSERT INTO equipment
        (id, name, name_normalized, equipment_value_cents, unit_indemnification_value_cents,
         stock_quantity, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        data.name,
        normalizeSearch(data.name),
        data.equipmentValueCents,
        data.unitIndemnificationValueCents,
        data.stockQuantity,
        now,
        now,
      ],
    );
    return mapEquipment(mustFind(this.db, "equipment", id));
  }

  update(id: string, input: EquipmentInput): Equipment {
    const data = parseInput(equipmentInputSchema, input);
    this.db.execute(
      `UPDATE equipment SET name = ?, name_normalized = ?, equipment_value_cents = ?,
       unit_indemnification_value_cents = ?, stock_quantity = ?, updated_at = ?
       WHERE id = ? AND archived_at IS NULL`,
      [
        data.name,
        normalizeSearch(data.name),
        data.equipmentValueCents,
        data.unitIndemnificationValueCents,
        data.stockQuantity,
        new Date().toISOString(),
        id,
      ],
    );
    return mapEquipment(mustFind(this.db, "equipment", id));
  }

  archive(id: string): void {
    const now = new Date().toISOString();
    this.db.execute(
      "UPDATE equipment SET archived_at = ?, updated_at = ? WHERE id = ?",
      [now, now, id],
    );
  }
}

function buildNameSearchWhere(
  normalizedSearch: string,
  params: DbParam[],
  minTermLength: number,
): string {
  const terms = normalizedSearch
    .split(" ")
    .filter((term) => term.length >= minTermLength);

  for (const term of terms) {
    params.push(`%${escapeLikeTerm(term)}%`);
  }

  return terms.map(() => "name_normalized LIKE ? ESCAPE '\\'").join(" AND ");
}

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
