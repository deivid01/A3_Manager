import { normalizeSearch, onlyDigits } from "../../domain/normalization";
import type { Customer, CustomerSearchResult } from "../../domain/types";
import type {
  DbParam,
  DbRow,
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
import { createId } from "../ids";

export class CustomerApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  list(search: string): Customer[] {
    const normalized = normalizeSearch(search);
    const digits = onlyDigits(search);
    const params: DbParam[] = [];
    let where = "archived_at IS NULL";
    if (normalized || digits) {
      where += ` AND (${customerSearchWhere()})`;
      params.push(
        `${normalized}%`,
        `${digits}%`,
        `${normalized}%`,
        `${normalized}%`,
        `${digits}%`,
      );
    }
    return this.db
      .queryAll(
        `SELECT * FROM customers WHERE ${where}
         ORDER BY ${customerDisplayOrderSql()} ASC LIMIT 100`,
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
        `SELECT * FROM customers
       WHERE archived_at IS NULL AND (${customerSearchWhere()})
       ORDER BY ${customerDisplayOrderSql()} ASC LIMIT 10`,
        [
          `${normalized}%`,
          `${digits}%`,
          `${normalized}%`,
          `${normalized}%`,
          `${digits}%`,
        ],
      )
      .map(mapCustomerSearchResult);
  }

  create(input: CustomerInput): Customer {
    const data = parseInput(customerInputSchema, input);
    const now = new Date().toISOString();
    const id = createId();
    try {
      this.db.execute(
        `INSERT INTO customers
          (id, customer_type, name, name_normalized, cpf, cpf_normalized, rg,
           legal_name, legal_name_normalized, trade_name, trade_name_normalized,
           cnpj, cnpj_normalized, state_registration, street, neighborhood,
           number, cep, city, state, contact, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          id,
          data.customerType,
          data.name,
          normalizeSearch(data.name),
          data.cpf,
          normalizedDocument(data.cpf),
          data.rg ?? "",
          nullIfBlank(data.legalName),
          normalizedOrNull(data.legalName),
          nullIfBlank(data.tradeName),
          normalizedOrNull(data.tradeName),
          nullIfBlank(data.cnpj),
          normalizedDocument(data.cnpj),
          nullIfBlank(data.stateRegistration),
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
          customer_type = ?, name = ?, name_normalized = ?, cpf = ?,
          cpf_normalized = ?, rg = ?, legal_name = ?,
          legal_name_normalized = ?, trade_name = ?, trade_name_normalized = ?,
          cnpj = ?, cnpj_normalized = ?, state_registration = ?, street = ?,
          neighborhood = ?, number = ?, cep = ?, city = ?, state = ?,
          contact = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`,
        [
          data.customerType,
          data.name,
          normalizeSearch(data.name),
          data.cpf,
          normalizedDocument(data.cpf),
          data.rg ?? "",
          nullIfBlank(data.legalName),
          normalizedOrNull(data.legalName),
          nullIfBlank(data.tradeName),
          normalizedOrNull(data.tradeName),
          nullIfBlank(data.cnpj),
          normalizedDocument(data.cnpj),
          nullIfBlank(data.stateRegistration),
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

function customerSearchWhere(): string {
  return [
    "name_normalized LIKE ?",
    "cpf_normalized LIKE ?",
    "legal_name_normalized LIKE ?",
    "trade_name_normalized LIKE ?",
    "cnpj_normalized LIKE ?",
  ].join(" OR ");
}

function customerDisplayOrderSql(): string {
  return `
    CASE customer_type
      WHEN 'PJ' THEN COALESCE(
        NULLIF(trade_name_normalized, ''),
        NULLIF(legal_name_normalized, ''),
        NULLIF(cnpj_normalized, ''),
        ''
      )
      ELSE COALESCE(NULLIF(name_normalized, ''), NULLIF(cpf_normalized, ''), '')
    END
  `;
}

function mapCustomerSearchResult(row: DbRow): CustomerSearchResult {
  const customer = mapCustomer(row);
  return {
    id: customer.id,
    customerType: customer.customerType,
    name: customer.name,
    cpf: customer.cpf,
    rg: customer.rg,
    legalName: customer.legalName,
    tradeName: customer.tradeName,
    cnpj: customer.cnpj,
    stateRegistration: customer.stateRegistration,
    street: customer.street,
    neighborhood: customer.neighborhood,
    number: customer.number,
    cep: customer.cep,
    city: customer.city,
    state: customer.state,
    contact: customer.contact,
  };
}

function normalizedDocument(value: string): string | null {
  const digits = onlyDigits(value);
  return digits ? digits : null;
}

function normalizedOrNull(value: string): string | null {
  const normalized = normalizeSearch(value);
  return normalized ? normalized : null;
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
