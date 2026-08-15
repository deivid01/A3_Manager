import { randomUUID } from "node:crypto";
import { AppError } from "../domain/appError";
import { calculateReturnDate } from "../domain/dateRules";
import { normalizeSearch, normalizeUsername, onlyDigits } from "../domain/normalization";
import type {
  CompanySettings,
  Customer,
  CustomerSearchResult,
  Equipment,
  EquipmentSearchResult,
  PagedResult,
  RentalDetail,
  RentalListItem,
  User
} from "../domain/types";
import type { SqlJsDatabase } from "../infrastructure/database/SqlJsDatabase";
import {
  companyInputSchema,
  customerInputSchema,
  equipmentInputSchema,
  loginSchema,
  rentalLaunchSchema,
  type CompanyInput,
  type CustomerInput,
  type EquipmentInput,
  type LoginInput,
  type RentalFilters,
  type RentalLaunchInput,
  type UserInput,
  userInputSchema
} from "../shared/contracts";
import { hashPassword, verifyPassword } from "./security";
import {
  mapCompany,
  mapCustomer,
  mapEquipment,
  mapRental,
  mapRentalItem,
  mapRentalListItem,
  mapUser
} from "./rowMappers";
import {
  buildRentalWhere,
  createRentalCode,
  duplicateOrDatabaseError,
  parseInput
} from "./serviceHelpers";
import { seedCompany, systemUser } from "./seeders";

export class ApplicationService {
  constructor(private readonly db: SqlJsDatabase) {}

  async initialize(): Promise<void> {
    await this.seedAdminUser();
    seedCompany(this.db);
  }

  async login(input: LoginInput): Promise<User> {
    const data = parseInput(loginSchema, input);
    const usernameNormalized = normalizeUsername(data.username);
    const row = this.db.queryOne(
      "SELECT * FROM users WHERE username_normalized = ? AND active = 1 LIMIT 1",
      [usernameNormalized]
    );

    if (!row || typeof row.password_hash !== "string") {
      throw new AppError("AUTH_INVALID", "Usuário ou senha inválidos.");
    }

    const valid = await verifyPassword(data.password, row.password_hash);
    if (!valid) {
      throw new AppError("AUTH_INVALID", "Usuário ou senha inválidos.");
    }

    return mapUser(row);
  }

  listUsers(): User[] {
    return this.db
      .queryAll("SELECT * FROM users ORDER BY username_normalized ASC")
      .map(mapUser);
  }

  async createUser(input: UserInput): Promise<User> {
    const data = parseInput(userInputSchema, input);
    const now = new Date().toISOString();
    const id = randomUUID();
    const username = normalizeUsername(data.username);
    const passwordHash = await hashPassword(data.password);

    try {
      this.db.execute(
        `INSERT INTO users
          (id, username, username_normalized, password_hash, role, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, username, username, passwordHash, data.role, now, now]
      );
    } catch (error) {
      throw duplicateOrDatabaseError(error, "Já existe um usuário com esse nome.");
    }

    return mapUser(this.mustFind("users", id));
  }

  getCompany(): CompanySettings {
    const row = this.db.queryOne("SELECT * FROM company_settings WHERE id = 'default'");
    if (!row) {
      throw new AppError("NOT_FOUND", "Configuração da empresa não encontrada.");
    }
    return mapCompany(row);
  }

  saveCompany(input: CompanyInput): CompanySettings {
    const data = parseInput(companyInputSchema, input);
    const now = new Date().toISOString();
    this.db.execute(
      `UPDATE company_settings SET
        legal_name = ?, trade_name = ?, document = ?, street = ?, neighborhood = ?,
        number = ?, cep = ?, city = ?, state = ?, contact = ?, email = ?, updated_at = ?
       WHERE id = 'default'`,
      [
        data.legalName,
        data.tradeName,
        data.document,
        data.street,
        data.neighborhood,
        data.number,
        data.cep,
        data.city,
        data.state,
        data.contact,
        data.email,
        now
      ]
    );
    return this.getCompany();
  }

  listCustomers(search: string): Customer[] {
    const normalized = normalizeSearch(search);
    const digits = onlyDigits(search);
    const params: (string | number | null)[] = [];
    let where = "archived_at IS NULL";

    if (normalized || digits) {
      where += " AND (name_normalized LIKE ? OR cpf_normalized LIKE ?)";
      params.push(`${normalized}%`, `${digits}%`);
    }

    return this.db
      .queryAll(`SELECT * FROM customers WHERE ${where} ORDER BY name_normalized ASC LIMIT 100`, params)
      .map(mapCustomer);
  }

  searchCustomers(search: string): CustomerSearchResult[] {
    const normalized = normalizeSearch(search);
    const digits = onlyDigits(search);
    if (normalized.length < 2 && digits.length < 3) {
      return [];
    }

    return this.db
      .queryAll(
        `SELECT id, name, cpf, city, contact FROM customers
         WHERE archived_at IS NULL AND (name_normalized LIKE ? OR cpf_normalized LIKE ?)
         ORDER BY name_normalized ASC LIMIT 10`,
        [`${normalized}%`, `${digits}%`]
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        cpf: String(row.cpf),
        city: String(row.city),
        contact: String(row.contact)
      }));
  }

  createCustomer(input: CustomerInput): Customer {
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
          now
        ]
      );
    } catch (error) {
      throw duplicateOrDatabaseError(error, "Já existe um cliente com esse CPF.");
    }

    return mapCustomer(this.mustFind("customers", id));
  }

  updateCustomer(id: string, input: CustomerInput): Customer {
    const data = parseInput(customerInputSchema, input);
    const now = new Date().toISOString();
    try {
      this.db.execute(
        `UPDATE customers SET
          name = ?, name_normalized = ?, cpf = ?, cpf_normalized = ?, rg = ?,
          street = ?, neighborhood = ?, number = ?, cep = ?, city = ?, state = ?,
          contact = ?, updated_at = ?
         WHERE id = ? AND archived_at IS NULL`,
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
          now,
          id
        ]
      );
    } catch (error) {
      throw duplicateOrDatabaseError(error, "Já existe um cliente com esse CPF.");
    }
    return mapCustomer(this.mustFind("customers", id));
  }

  archiveCustomer(id: string): void {
    this.db.execute("UPDATE customers SET archived_at = ?, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      new Date().toISOString(),
      id
    ]);
  }

  listEquipment(search: string): Equipment[] {
    const normalized = normalizeSearch(search);
    const params: (string | number | null)[] = [];
    let where = "archived_at IS NULL";
    if (normalized) {
      where += " AND name_normalized LIKE ?";
      params.push(`${normalized}%`);
    }
    return this.db
      .queryAll(`SELECT * FROM equipment WHERE ${where} ORDER BY name_normalized ASC LIMIT 100`, params)
      .map(mapEquipment);
  }

  searchEquipment(search: string): EquipmentSearchResult[] {
    const normalized = normalizeSearch(search);
    if (normalized.length < 2) {
      return [];
    }
    return this.db
      .queryAll(
        `SELECT id, name, stock_quantity, equipment_value_cents, unit_indemnification_value_cents
         FROM equipment
         WHERE archived_at IS NULL AND name_normalized LIKE ?
         ORDER BY name_normalized ASC LIMIT 10`,
        [`${normalized}%`]
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        stockQuantity: Number(row.stock_quantity),
        equipmentValueCents: Number(row.equipment_value_cents),
        unitIndemnificationValueCents: Number(row.unit_indemnification_value_cents)
      }));
  }

  createEquipment(input: EquipmentInput): Equipment {
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
        now
      ]
    );
    return mapEquipment(this.mustFind("equipment", id));
  }

  updateEquipment(id: string, input: EquipmentInput): Equipment {
    const data = parseInput(equipmentInputSchema, input);
    this.db.execute(
      `UPDATE equipment SET
        name = ?, name_normalized = ?, equipment_value_cents = ?,
        unit_indemnification_value_cents = ?, stock_quantity = ?, updated_at = ?
       WHERE id = ? AND archived_at IS NULL`,
      [
        data.name,
        normalizeSearch(data.name),
        data.equipmentValueCents,
        data.unitIndemnificationValueCents,
        data.stockQuantity,
        new Date().toISOString(),
        id
      ]
    );
    return mapEquipment(this.mustFind("equipment", id));
  }

  archiveEquipment(id: string): void {
    this.db.execute("UPDATE equipment SET archived_at = ?, updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      new Date().toISOString(),
      id
    ]);
  }

  launchRental(input: RentalLaunchInput, userId: string): RentalDetail {
    const data = parseInput(rentalLaunchSchema, input);
    return this.db.transaction(() => {
      const user = mapUser(this.mustFind("users", userId));
      const customer = mapCustomer(this.mustFind("customers", data.customerId));
      const company = this.getCompany();
      const returnDate = calculateReturnDate(data.startDate, data.period);
      const ids = new Set(data.items.map((item) => item.equipmentId));
      if (ids.size !== data.items.length) {
        throw new AppError("VALIDATION_ERROR", "Cada equipamento deve aparecer apenas uma vez na locação.");
      }

      const rentalId = randomUUID();
      const now = new Date().toISOString();
      const code = createRentalCode(this.db, now);
      this.db.execute(
        `INSERT INTO rentals
          (id, code, status, customer_id, user_id, period, start_date, return_date,
           delivery_street, delivery_neighborhood, delivery_number, delivery_cep, delivery_city,
           delivery_state, receiver_is_customer, receiver_name, receiver_cpf, payment_method,
           installments, customer_name_snapshot, customer_name_snapshot_normalized,
           customer_snapshot_json, company_snapshot_json, launched_by_username,
           finalized_at, created_at, updated_at)
         VALUES (?, ?, 'ONGOING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          rentalId,
          code,
          data.customerId,
          userId,
          data.period,
          data.startDate,
          returnDate,
          data.deliveryStreet ?? "",
          data.deliveryNeighborhood ?? "",
          data.deliveryNumber ?? "",
          data.deliveryCep ?? "",
          data.deliveryCity ?? "",
          data.deliveryState ?? "",
          data.receiverIsCustomer ? 1 : 0,
          data.receiverName ?? "",
          data.receiverCpf ?? "",
          data.paymentMethod,
          data.installments,
          customer.name,
          normalizeSearch(customer.name),
          JSON.stringify(customer),
          JSON.stringify(company),
          user.username,
          now,
          now
        ]
      );

      for (const item of data.items) {
        const equipment = mapEquipment(this.mustFind("equipment", item.equipmentId));
        if (equipment.archivedAt) {
          throw new AppError("VALIDATION_ERROR", "Não é possível locar um equipamento arquivado.");
        }
        if (equipment.stockQuantity < item.quantity) {
          throw new AppError(
            "INSUFFICIENT_STOCK",
            `Estoque insuficiente para ${equipment.name}. Disponível: ${equipment.stockQuantity}.`
          );
        }

        this.db.execute("UPDATE equipment SET stock_quantity = ?, updated_at = ? WHERE id = ?", [
          equipment.stockQuantity - item.quantity,
          now,
          equipment.id
        ]);
        this.db.execute(
          `INSERT INTO rental_items
            (id, rental_id, equipment_id, name_snapshot, quantity,
             equipment_value_cents, unit_indemnification_value_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            rentalId,
            equipment.id,
            equipment.name,
            item.quantity,
            equipment.equipmentValueCents,
            equipment.unitIndemnificationValueCents
          ]
        );
        this.db.execute(
          `INSERT INTO inventory_movements
            (id, equipment_id, rental_id, type, quantity, created_at, note)
           VALUES (?, ?, ?, 'RENTAL_OUT', ?, ?, ?)`,
          [randomUUID(), equipment.id, rentalId, item.quantity, now, `Locação ${code}`]
        );
      }

      return this.getRental(rentalId);
    });
  }

  listRentals(filters: RentalFilters): PagedResult<RentalListItem> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize ?? 10), 50);
    const { where, params } = buildRentalWhere(filters);
    const totalRow = this.db.queryOne(`SELECT COUNT(*) AS total FROM rentals r ${where}`, params);
    const rows = this.db
      .queryAll(
        `SELECT r.*, COALESCE(SUM(ri.quantity), 0) AS total_items
         FROM rentals r
         LEFT JOIN rental_items ri ON ri.rental_id = r.id
         ${where}
         GROUP BY r.id
         ORDER BY r.created_at DESC, r.code DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      )
      .map(mapRentalListItem);

    return { rows, total: Number(totalRow?.total ?? 0), page, pageSize };
  }

  getRental(id: string): RentalDetail {
    const row = this.db.queryOne("SELECT * FROM rentals WHERE id = ?", [id]);
    if (!row) {
      throw new AppError("NOT_FOUND", "Locação não encontrada.");
    }
    const items = this.db
      .queryAll("SELECT * FROM rental_items WHERE rental_id = ? ORDER BY name_snapshot ASC", [id])
      .map(mapRentalItem);
    return { ...mapRental(row), items };
  }

  finalizeRental(id: string): RentalDetail {
    return this.db.transaction(() => {
      const rental = this.getRental(id);
      if (rental.status === "FINALIZED") {
        throw new AppError("RENTAL_ALREADY_FINALIZED", "Esta locação já foi finalizada.");
      }

      const now = new Date().toISOString();
      for (const item of rental.items) {
        const equipment = mapEquipment(this.mustFind("equipment", item.equipmentId));
        this.db.execute("UPDATE equipment SET stock_quantity = ?, updated_at = ? WHERE id = ?", [
          equipment.stockQuantity + item.quantity,
          now,
          equipment.id
        ]);
        this.db.execute(
          `INSERT INTO inventory_movements
            (id, equipment_id, rental_id, type, quantity, created_at, note)
           VALUES (?, ?, ?, 'RENTAL_RETURN', ?, ?, ?)`,
          [randomUUID(), equipment.id, rental.id, item.quantity, now, `Devolução ${rental.code}`]
        );
      }

      this.db.execute(
        "UPDATE rentals SET status = 'FINALIZED', finalized_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id]
      );
      return this.getRental(id);
    });
  }

  private async seedAdminUser(): Promise<void> {
    const row = this.db.queryOne("SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN'");
    if (Number(row?.total ?? 0) > 0) {
      return;
    }

    await this.createUser(systemUser);
  }

  private mustFind(table: "users" | "customers" | "equipment", id: string) {
    const row = this.db.queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) {
      throw new AppError("NOT_FOUND", "Registro não encontrado.");
    }
    return row;
  }
}
