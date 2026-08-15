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
    name: asText(row.name),
    cpf: asText(row.cpf),
    rg: asText(row.rg),
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
    equipmentValueCents: asNumber(row.equipment_value_cents),
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
    receiverIsCustomer: asNumber(row.receiver_is_customer) === 1,
    receiverName: asText(row.receiver_name),
    receiverCpf: asText(row.receiver_cpf),
    paymentMethod: asText(row.payment_method) as Rental["paymentMethod"],
    installments: row.installments == null ? null : asNumber(row.installments),
    customerSnapshot: JSON.parse(asText(row.customer_snapshot_json)) as Rental["customerSnapshot"],
    companySnapshot: JSON.parse(asText(row.company_snapshot_json)) as Rental["companySnapshot"],
    launchedByUsername: asText(row.launched_by_username),
    finalizedAt: nullableText(row.finalized_at),
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
    equipmentValueCents: asNumber(row.equipment_value_cents),
    unitIndemnificationValueCents: asNumber(row.unit_indemnification_value_cents)
  };
}

export function mapRentalListItem(row: DbRow): RentalListItem {
  return {
    id: asText(row.id),
    code: asText(row.code),
    status: asText(row.status) === "FINALIZED" ? "FINALIZED" : "ONGOING",
    customerName: asText(row.customer_name_snapshot),
    startDate: asText(row.start_date),
    returnDate: asText(row.return_date),
    createdAt: asText(row.created_at),
    totalItems: asNumber(row.total_items)
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
