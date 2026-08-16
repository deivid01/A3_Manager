export const USER_ROLES = ["ADMIN", "USER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const RENTAL_PERIODS = [
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUAL",
  "ANNUAL"
] as const;
export type RentalPeriod = (typeof RENTAL_PERIODS)[number];

export const RENTAL_STATUSES = ["ONGOING", "FINALIZED"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const PAYMENT_METHODS = [
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CASH",
  "PIX",
  "BOLETO"
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
] as const;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

export interface User {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  id: string;
  legalName: string;
  tradeName: string;
  document: string;
  street: string;
  neighborhood: string;
  number: string;
  cep: string;
  city: string;
  state: string;
  contact: string;
  email: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  cpf: string;
  rg: string;
  street: string;
  neighborhood: string;
  number: string;
  cep: string;
  city: string;
  state: string;
  contact: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Equipment {
  id: string;
  name: string;
  equipmentValueCents: number;
  unitIndemnificationValueCents: number;
  stockQuantity: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentalItem {
  id: string;
  rentalId: string;
  equipmentId: string;
  nameSnapshot: string;
  quantity: number;
  equipmentValueCents: number;
  unitIndemnificationValueCents: number;
}

export interface Rental {
  id: string;
  code: string;
  status: RentalStatus;
  customerId: string;
  userId: string;
  period: RentalPeriod;
  startDate: string;
  returnDate: string;
  deliveryStreet: string;
  deliveryNeighborhood: string;
  deliveryNumber: string;
  deliveryCep: string;
  deliveryCity: string;
  deliveryState: string;
  receiverIsCustomer: boolean;
  receiverName: string;
  receiverCpf: string;
  paymentMethod: PaymentMethod;
  installments: number | null;
  clientRequestId: string | null;
  customerSnapshot: Customer;
  companySnapshot: CompanySettings;
  launchedByUsername: string;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RentalDetail extends Rental {
  items: RentalItem[];
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  cpf: string;
  street: string;
  neighborhood: string;
  number: string;
  cep: string;
  city: string;
  state: string;
  contact: string;
}

export interface EquipmentSearchResult {
  id: string;
  name: string;
  stockQuantity: number;
  equipmentValueCents: number;
  unitIndemnificationValueCents: number;
}

export interface RentalListItem {
  id: string;
  code: string;
  status: RentalStatus;
  customerName: string;
  startDate: string;
  returnDate: string;
  createdAt: string;
  totalItems: number;
}

export interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventoryMovement {
  id: string;
  equipmentId: string;
  rentalId: string | null;
  type: "RENTAL_OUT" | "RENTAL_RETURN" | "ADJUSTMENT";
  quantity: number;
  createdAt: string;
  note: string;
}
