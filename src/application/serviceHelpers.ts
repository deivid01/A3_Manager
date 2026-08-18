import { ZodError, type ZodSchema } from "zod";
import { AppError } from "../domain/appError";
import { normalizeSearch } from "../domain/normalization";
import type {
  DbParam,
  DbRow,
  SqlJsDatabase,
} from "../infrastructure/database/SqlJsDatabase";
import type { RentalFilters } from "../shared/contracts";

export function parseInput<T>(schema: ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError(
        "VALIDATION_ERROR",
        error.issues[0]?.message ?? "Dados inválidos.",
      );
    }
    throw error;
  }
}

export function duplicateOrDatabaseError(
  error: unknown,
  duplicateMessage: string,
): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE")) {
    return new AppError("DUPLICATE", duplicateMessage);
  }
  return new AppError(
    "DATABASE_ERROR",
    "Falha ao gravar os dados no banco local.",
  );
}

export function buildRentalWhere(filters: RentalFilters): {
  where: string;
  params: DbParam[];
} {
  const clauses: string[] = [];
  const params: DbParam[] = [];

  if (filters.archiveStatus === "ARCHIVED") {
    clauses.push("r.archived_at IS NOT NULL");
  } else if (filters.archiveStatus !== "ALL") {
    clauses.push("r.archived_at IS NULL");
  }

  if (filters.status && filters.status !== "ALL") {
    clauses.push("r.status = ?");
    params.push(filters.status);
  }
  if (filters.code?.trim()) {
    clauses.push("r.code LIKE ?");
    params.push(`%${filters.code.trim().toUpperCase()}%`);
  }
  if (filters.customerName?.trim()) {
    clauses.push("r.customer_name_snapshot_normalized LIKE ?");
    params.push(`${normalizeSearch(filters.customerName)}%`);
  }
  if (filters.startDate) {
    clauses.push("r.start_date >= ?");
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push("r.start_date <= ?");
    params.push(filters.endDate);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function createRentalCode(db: SqlJsDatabase, nowIso: string): string {
  const day = nowIso.slice(0, 10).replace(/-/g, "");
  const prefix = `LOC-${day}-`;
  const row = db.queryOne(
    "SELECT COUNT(*) AS total FROM rentals WHERE code LIKE ?",
    [`${prefix}%`],
  );
  return `${prefix}${String(Number(row?.total ?? 0) + 1).padStart(4, "0")}`;
}

export function mustFind(
  db: SqlJsDatabase,
  table: "users" | "customers" | "equipment",
  id: string,
): DbRow {
  const row = db.queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) {
    throw new AppError("NOT_FOUND", "Registro não encontrado.");
  }
  return row;
}
