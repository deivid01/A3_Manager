import type { DbRow } from "../infrastructure/database/SqlJsDatabase";
import type {
  CompanySettings,
  Customer,
  Equipment,
  Rental,
  RentalItem,
  RentalListItem,
  User
} from "../domain/types";

export function mapUser(row: DbRow): User {
  return {
    id: asText(row.id),
    username: asText(row.username),
    role: asText(row.role) === "ADMIN" ? "ADMIN" : "USER",
    active: asNumber(row.active) === 1,
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at)
  };
}

export function mapCompany(row: DbRow): CompanySettings {
  return {
    id: asText(row.id),
    legalName: asText(row.legal_name),
    tradeName: asText(row.trade_name),
    document: asText(row.document),
    street: asText(row.street),
    neighborhood: asText(row.neighborhood),
    number: asText(row.number),
    cep: asText(row.cep),
    city: asText(row.city),
    state: asText(row.state),
    contact: asText(row.contact),
    email: asText(row.email),
    updatedAt: asText(row.updated_at)
  };
}

export function mapCustomer(row: DbRow): Customer {
  return {
    id: asText(row.id),
    customerType: asText(row.customer_type) === "PJ" ? "PJ" : "PF",
    name: asText(row.name),
    cpf: asText(row.cpf),
    rg: asText(row.rg),
    legalName: asText(row.legal_name),
    tradeName: asText(row.trade_name),
    cnpj: asText(row.cnpj),
    stateRegistration: asText(row.state_registration),
    street: asText(row.street),
    neighborhood: asText(row.neighborhood),
    number: asText(row.number),
    cep: asText(row.cep),
    city: asText(row.city),
    state: asText(row.state),
    contact: asText(row.contact),
    archivedAt: nullableText(row.archived_at),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at)
  };
}

export function mapEquipment(row: DbRow): Equipment {
  return {
    id: asText(row.id),
    name: asText(row.name),
    dailyRateCents: asNumber(row.daily_rate_cents),
    weeklyRateCents: asNumber(row.weekly_rate_cents),
    biweeklyRateCents: asNumber(row.biweekly_rate_cents),
    monthlyRateCents: asNumber(row.monthly_rate_cents),
    unitIndemnificationValueCents: asNumber(row.unit_indemnification_value_cents),
    stockQuantity: asNumber(row.stock_quantity),
    archivedAt: nullableText(row.archived_at),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at)
  };
}

export function mapRental(row: DbRow): Rental {
  return {
    id: asText(row.id),
    code: asText(row.code),
    status: asText(row.status) === "FINALIZED" ? "FINALIZED" : "ONGOING",
    customerId: asText(row.customer_id),
    userId: asText(row.user_id),
    period: asText(row.period) as Rental["period"],
    startDate: asText(row.start_date),
    returnDate: asText(row.return_date),
    deliveryStreet: asText(row.delivery_street),
    deliveryNeighborhood: asText(row.delivery_neighborhood),
    deliveryNumber: asText(row.delivery_number),
    deliveryCep: asText(row.delivery_cep),
    deliveryCity: asText(row.delivery_city),
    deliveryState: asText(row.delivery_state),
    paymentMethod: asText(row.payment_method) as Rental["paymentMethod"],
    installments: row.installments == null ? null : asNumber(row.installments),
    clientRequestId: nullableText(row.client_request_id),
    customerSnapshot: mapCustomerSnapshot(row.customer_snapshot_json),
    companySnapshot: JSON.parse(asText(row.company_snapshot_json)) as Rental["companySnapshot"],
    launchedByUsername: asText(row.launched_by_username),
    finalizedAt: nullableText(row.finalized_at),
    archivedAt: nullableText(row.archived_at),
    archivedByUserId: nullableText(row.archived_by_user_id),
    createdAt: asText(row.created_at),
    updatedAt: asText(row.updated_at)
  };
}

export function mapRentalItem(row: DbRow): RentalItem {
  return {
    id: asText(row.id),
    rentalId: asText(row.rental_id),
    equipmentId: asText(row.equipment_id),
    nameSnapshot: asText(row.name_snapshot),
    quantity: asNumber(row.quantity),
    unitRentalRateCents: asNumber(
      row.unit_rental_rate_cents ?? row.equipment_value_cents,
    ),
    unitIndemnificationValueCents: asNumber(row.unit_indemnification_value_cents)
  };
}

export function mapRentalListItem(row: DbRow): RentalListItem {
  return {
    id: asText(row.id),
    code: asText(row.code),
    status: asText(row.status) === "FINALIZED" ? "FINALIZED" : "ONGOING",
    period: asText(row.period) as RentalListItem["period"],
    customerName: asText(row.customer_name_snapshot),
    startDate: asText(row.start_date),
    returnDate: asText(row.return_date),
    createdAt: asText(row.created_at),
    totalItems: asNumber(row.total_items),
    archivedAt: nullableText(row.archived_at)
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value == null ? null : asText(value);
}

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

function mapCustomerSnapshot(value: unknown): Customer {
  const snapshot = parseJsonObject(value);
  return {
    id: asText(snapshot.id),
    customerType: asText(snapshot.customerType) === "PJ" ? "PJ" : "PF",
    name: asText(snapshot.name),
    cpf: asText(snapshot.cpf),
    rg: asText(snapshot.rg),
    legalName: asText(snapshot.legalName),
    tradeName: asText(snapshot.tradeName),
    cnpj: asText(snapshot.cnpj),
    stateRegistration: asText(snapshot.stateRegistration),
    street: asText(snapshot.street),
    neighborhood: asText(snapshot.neighborhood),
    number: asText(snapshot.number),
    cep: asText(snapshot.cep),
    city: asText(snapshot.city),
    state: asText(snapshot.state),
    contact: asText(snapshot.contact),
    archivedAt: snapshot.archivedAt == null ? null : asText(snapshot.archivedAt),
    createdAt: asText(snapshot.createdAt),
    updatedAt: asText(snapshot.updatedAt)
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(asText(value)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
