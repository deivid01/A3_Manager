import { randomUUID } from "node:crypto";
import { AppError } from "../../domain/appError";
import { calculateReturnDate } from "../../domain/dateRules";
import { getRentalRateForPeriod } from "../../domain/money";
import { normalizeSearch } from "../../domain/normalization";
import type {
  PagedResult,
  RentalDetail,
  RentalListItem,
} from "../../domain/types";
import type { SqlJsDatabase } from "../../infrastructure/database/SqlJsDatabase";
import {
  rentalLaunchSchema,
  type RentalFilters,
  type RentalLaunchInput,
} from "../../shared/contracts";
import {
  mapCustomer,
  mapEquipment,
  mapRental,
  mapRentalItem,
  mapRentalListItem,
  mapUser,
} from "../rowMappers";
import {
  buildRentalWhere,
  createRentalCode,
  mustFind,
  parseInput,
} from "../serviceHelpers";
import type { CompanyApplicationService } from "./CompanyApplicationService";

export class RentalApplicationService {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly company: CompanyApplicationService,
  ) {}

  launch(input: RentalLaunchInput, userId: string): RentalDetail {
    const data = parseInput(rentalLaunchSchema, input);
    return this.db.transaction(() => {
      if (data.clientRequestId) {
        const existing = this.db.queryOne(
          "SELECT id FROM rentals WHERE client_request_id = ?",
          [data.clientRequestId],
        );
        if (existing) return this.get(String(existing.id));
      }

      const user = mapUser(mustFind(this.db, "users", userId));
      const customer = mapCustomer(
        mustFind(this.db, "customers", data.customerId),
      );
      const company = this.company.get();
      const returnDate = calculateReturnDate(data.startDate, data.period);
      const installments =
        data.paymentMethod === "CREDIT_CARD" ? data.installments : null;
      const receiverName = data.receiverIsCustomer
        ? ""
        : (data.receiverName ?? "");
      const receiverCpf = data.receiverIsCustomer
        ? ""
        : (data.receiverCpf ?? "");
      const uniqueEquipmentIds = new Set(
        data.items.map((item) => item.equipmentId),
      );
      if (uniqueEquipmentIds.size !== data.items.length) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Cada equipamento deve aparecer apenas uma vez na locação.",
        );
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
           client_request_id, finalized_at, archived_at, archived_by_user_id, created_at, updated_at)
         VALUES (?, ?, 'ONGOING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
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
          receiverName,
          receiverCpf,
          data.paymentMethod,
          installments,
          customer.name,
          normalizeSearch(customer.name),
          JSON.stringify(customer),
          JSON.stringify(company),
          user.username,
          data.clientRequestId ?? null,
          now,
          now,
        ],
      );

      for (const item of data.items) {
        const equipment = mapEquipment(
          mustFind(this.db, "equipment", item.equipmentId),
        );
        if (equipment.archivedAt) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Não é possível locar um equipamento arquivado.",
          );
        }
        if (equipment.stockQuantity < item.quantity) {
          throw new AppError(
            "INSUFFICIENT_STOCK",
            `Estoque insuficiente para ${equipment.name}. Disponível: ${equipment.stockQuantity}.`,
          );
        }
        this.db.execute(
          "UPDATE equipment SET stock_quantity = ?, updated_at = ? WHERE id = ?",
          [equipment.stockQuantity - item.quantity, now, equipment.id],
        );
        this.db.execute(
          `INSERT INTO rental_items
            (id, rental_id, equipment_id, name_snapshot, quantity,
             equipment_value_cents, unit_rental_rate_cents, unit_indemnification_value_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            rentalId,
            equipment.id,
            equipment.name,
            item.quantity,
            getRentalRateForPeriod(equipment, data.period),
            getRentalRateForPeriod(equipment, data.period),
            equipment.unitIndemnificationValueCents,
          ],
        );
        this.db.execute(
          `INSERT INTO inventory_movements
            (id, equipment_id, rental_id, type, quantity, created_at, note)
           VALUES (?, ?, ?, 'RENTAL_OUT', ?, ?, ?)`,
          [
            randomUUID(),
            equipment.id,
            rentalId,
            item.quantity,
            now,
            `Locação ${code}`,
          ],
        );
      }
      return this.get(rentalId);
    });
  }

  list(filters: RentalFilters): PagedResult<RentalListItem> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(Math.max(1, filters.pageSize ?? 10), 50);
    const { where, params } = buildRentalWhere(filters);
    const totalRow = this.db.queryOne(
      `SELECT COUNT(*) AS total FROM rentals r ${where}`,
      params,
    );
    const rows = this.db
      .queryAll(
        `SELECT r.id, r.code, r.status, r.period, r.customer_name_snapshot, r.start_date,
        r.return_date, r.created_at, r.archived_at,
        COALESCE((SELECT SUM(ri.quantity) FROM rental_items ri WHERE ri.rental_id = r.id), 0) AS total_items
       FROM rentals r ${where}
       ORDER BY r.created_at DESC, r.code DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      )
      .map(mapRentalListItem);
    return { rows, total: Number(totalRow?.total ?? 0), page, pageSize };
  }

  get(id: string): RentalDetail {
    const row = this.db.queryOne("SELECT * FROM rentals WHERE id = ?", [id]);
    if (!row) throw new AppError("NOT_FOUND", "Locação não encontrada.");
    const items = this.db
      .queryAll(
        "SELECT * FROM rental_items WHERE rental_id = ? ORDER BY name_snapshot ASC",
        [id],
      )
      .map(mapRentalItem);
    return { ...mapRental(row), items };
  }

  finalize(id: string): RentalDetail {
    return this.db.transaction(() => {
      const rental = this.get(id);
      if (rental.status === "FINALIZED") {
        throw new AppError(
          "RENTAL_ALREADY_FINALIZED",
          "Esta locação já foi finalizada.",
        );
      }
      const now = new Date().toISOString();
      for (const item of rental.items) {
        const equipment = mapEquipment(
          mustFind(this.db, "equipment", item.equipmentId),
        );
        this.db.execute(
          "UPDATE equipment SET stock_quantity = ?, updated_at = ? WHERE id = ?",
          [equipment.stockQuantity + item.quantity, now, equipment.id],
        );
        this.db.execute(
          `INSERT INTO inventory_movements
            (id, equipment_id, rental_id, type, quantity, created_at, note)
           VALUES (?, ?, ?, 'RENTAL_RETURN', ?, ?, ?)`,
          [
            randomUUID(),
            equipment.id,
            rental.id,
            item.quantity,
            now,
            `Devolução ${rental.code}`,
          ],
        );
      }
      this.db.execute(
        "UPDATE rentals SET status = 'FINALIZED', finalized_at = ?, updated_at = ? WHERE id = ?",
        [now, now, id],
      );
      return this.get(id);
    });
  }

  archive(id: string, userId: string): RentalDetail {
    const now = new Date().toISOString();
    this.db.execute(
      `UPDATE rentals
       SET archived_at = COALESCE(archived_at, ?),
           archived_by_user_id = COALESCE(archived_by_user_id, ?),
           updated_at = ?
       WHERE id = ?`,
      [now, userId, now, id],
    );
    return this.get(id);
  }

  unarchive(id: string): RentalDetail {
    const now = new Date().toISOString();
    this.db.execute(
      `UPDATE rentals
       SET archived_at = NULL,
           archived_by_user_id = NULL,
           updated_at = ?
       WHERE id = ?`,
      [now, id],
    );
    return this.get(id);
  }
}
