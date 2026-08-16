import { randomUUID } from "node:crypto";
import { normalizeSearch, onlyDigits } from "../../domain/normalization";
import type { Customer, CustomerSearchResult } from "../../domain/types";
import type {
  DbParam,
  SqlJsDatabase,
} from "../../infrastructure/database/SqlJsDatabase";
import {
  customerInputSchema,
  type CustomerInput,
} from "../../shared/contracts";
import { mapCustomer } from "../rowMappers";
import {
  duplicateOrDatabaseError,
  mustFind,
  parseInput,
} from "../serviceHelpers";

export class CustomerApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  list(search: string): Customer[] {
    const normalized = normalizeSearch(search);
    const digits = onlyDigits(search);
    const params: DbParam[] = [];
    let where = "archived_at IS NULL";
    if (normalized || digits) {
      where += " AND (name_normalized LIKE ? OR cpf_normalized LIKE ?)";
      params.push(`${normalized}%`, `${digits}%`);
    }
    return this.db
      .queryAll(
        `SELECT * FROM customers WHERE ${where} ORDER BY name_normalized ASC LIMIT 100`,
        params,
      )
      .map(mapCustomer);
  }

  search(search: string): CustomerSearchResult[] {
    const normalized = normalizeSearch(search);
    const digits = onlyDigits(search);
    if (normalized.length < 2 && digits.length < 3) return [];
    return this.db
      .queryAll(
        `SELECT id, name, cpf, street, neighborhood, number, cep, city, state, contact FROM customers
       WHERE archived_at IS NULL AND (name_normalized LIKE ? OR cpf_normalized LIKE ?)
       ORDER BY name_normalized ASC LIMIT 10`,
        [`${normalized}%`, `${digits}%`],
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        cpf: String(row.cpf),
        street: String(row.street),
        neighborhood: String(row.neighborhood),
        number: String(row.number),
        cep: String(row.cep),
        city: String(row.city),
        state: String(row.state),
        contact: String(row.contact),
      }));
  }

  create(input: CustomerInput): Customer {
    const data = parseInput(customerInputSchema, input);
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      this.db.execute(
        `INSERT INTO customers
          (id, name, name_normalized, cpf, cpf_normalized, rg, street, neighborhood,
           number, cep, city, state, contact, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          id,
          data.name,
          normalizeSearch(data.name),
          data.cpf,
          onlyDigits(data.cpf),
          data.rg ?? "",
          data.street,
          data.neighborhood,
          data.number,
          data.cep,
          data.city,
          data.state,
          data.contact,
          now,
          now,
        ],
      );
    } catch (error) {
      throw duplicateOrDatabaseError(
        error,
        "Já existe um cliente com esse CPF.",
      );
    }
    return mapCustomer(mustFind(this.db, "customers", id));
  }

  update(id: string, input: CustomerInput): Customer {
    const data = parseInput(customerInputSchema, input);
    try {
      this.db.execute(
        `UPDATE customers SET
          name = ?, name_normalized = ?, cpf = ?, cpf_normalized = ?, rg = ?,
          street = ?, neighborhood = ?, number = ?, cep = ?, city = ?, state = ?,
          contact = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`,
        [
          data.name,
          normalizeSearch(data.name),
          data.cpf,
          onlyDigits(data.cpf),
          data.rg ?? "",
          data.street,
          data.neighborhood,
          data.number,
          data.cep,
          data.city,
          data.state,
          data.contact,
          new Date().toISOString(),
          id,
        ],
      );
    } catch (error) {
      throw duplicateOrDatabaseError(
        error,
        "Já existe um cliente com esse CPF.",
      );
    }
    return mapCustomer(mustFind(this.db, "customers", id));
  }

  archive(id: string): void {
    const now = new Date().toISOString();
    this.db.execute(
      "UPDATE customers SET archived_at = ?, updated_at = ? WHERE id = ?",
      [now, now, id],
    );
  }
}
