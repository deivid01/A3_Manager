import { z } from "zod";
import { isValidCpf, onlyDigits } from "../domain/normalization";
import {
  BRAZILIAN_STATES,
  PAYMENT_METHODS,
  RENTAL_PERIODS,
  USER_ROLES,
} from "../domain/types";
import type {
  CompanySettings,
  Customer,
  CustomerSearchResult,
  Equipment,
  EquipmentSearchResult,
  PagedResult,
  PaymentMethod,
  RentalDetail,
  RentalListItem,
  RentalPeriod,
  RentalStatus,
  User,
} from "../domain/types";

const requiredText = z.string().trim().min(1, "Campo obrigatório.");
const optionalText = z.string().trim().default("");
const cpfField = requiredText.refine(isValidCpf, "Informe um CPF válido.");
const cepField = requiredText.refine(
  (value) => onlyDigits(value).length === 8,
  "Informe um CEP válido.",
);
const optionalCepField = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => value === "" || onlyDigits(value).length === 8,
    "Informe um CEP válido.",
  );

export const loginSchema = z.object({
  username: requiredText,
  password: requiredText,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userInputSchema = z.object({
  username: requiredText,
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  role: z.enum(USER_ROLES),
});
export type UserInput = z.infer<typeof userInputSchema>;

export const customerInputSchema = z.object({
  name: requiredText,
  cpf: cpfField,
  rg: optionalText,
  street: requiredText,
  neighborhood: requiredText,
  number: requiredText,
  cep: cepField,
  city: requiredText,
  state: z.enum(BRAZILIAN_STATES),
  contact: requiredText,
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const equipmentInputSchema = z.object({
  name: requiredText,
  equipmentValueCents: z.number().int().nonnegative(),
  unitIndemnificationValueCents: z.number().int().nonnegative(),
  stockQuantity: z.number().int().nonnegative(),
});
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

export const companyInputSchema = z.object({
  legalName: requiredText,
  tradeName: requiredText,
  document: requiredText,
  street: requiredText,
  neighborhood: requiredText,
  number: requiredText,
  cep: cepField,
  city: requiredText,
  state: z.enum(BRAZILIAN_STATES),
  contact: requiredText,
  email: z.string().trim().email("Informe um e-mail válido.").or(z.literal("")),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const rentalItemInputSchema = z.object({
  equipmentId: requiredText,
  quantity: z.number().int().positive("Informe uma quantidade positiva."),
});
export type RentalItemInput = z.infer<typeof rentalItemInputSchema>;

export const rentalLaunchSchema = z
  .object({
    customerId: requiredText,
    period: z.enum(RENTAL_PERIODS),
    startDate: requiredText,
    items: z
      .array(rentalItemInputSchema)
      .min(1, "Inclua pelo menos um equipamento."),
    deliveryStreet: optionalText,
    deliveryNeighborhood: optionalText,
    deliveryNumber: optionalText,
    deliveryCep: optionalCepField,
    deliveryCity: optionalText,
    deliveryState: z.enum(BRAZILIAN_STATES).or(z.literal("")),
    receiverIsCustomer: z.boolean(),
    receiverName: optionalText,
    receiverCpf: z.string().trim().default(""),
    paymentMethod: z.enum(PAYMENT_METHODS),
    installments: z.number().int().positive().nullable(),
    clientRequestId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.receiverIsCustomer) {
      if (!value.receiverName.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o nome de quem receberá os equipamentos.",
          path: ["receiverName"],
        });
      }
      if (!isValidCpf(value.receiverCpf)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o CPF de quem receberá os equipamentos.",
          path: ["receiverCpf"],
        });
      }
    }

    if (value.paymentMethod === "CREDIT_CARD" && !value.installments) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe a quantidade de parcelas do cartão de crédito.",
        path: ["installments"],
      });
    }
  });
export type RentalLaunchInput = z.infer<typeof rentalLaunchSchema>;

export interface RentalFilters {
  status?: RentalStatus | "ALL";
  code?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AppInfo {
  name: string;
  version: string;
  developerUrl: string;
}

export const a20sSyncConfigSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Informe uma URL válida para o servidor A20s."),
  database: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Use apenas letras, números, hífen ou underscore no nome do banco.",
    ),
  token: z.string().optional().default(""),
});
export type A20sSyncConfigInput = z.infer<typeof a20sSyncConfigSchema>;

export interface A20sSyncPublicConfig {
  baseUrl: string;
  database: string;
  tokenConfigured: boolean;
}

export type SyncConnectionState =
  | "not_configured"
  | "online"
  | "syncing"
  | "offline"
  | "pending"
  | "error";

export interface SyncStatus {
  state: SyncConnectionState;
  baseUrl: string;
  database: string;
  pendingCount: number;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface SyncTestResult {
  ok: boolean;
  health: boolean;
  authenticated: boolean;
  databaseFound: boolean;
  message: string;
}

export interface A3Api {
  appInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<boolean>;
  closeWindow(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  onWindowMaximizedChanged(listener: (maximized: boolean) => void): () => void;
  login(input: LoginInput): Promise<User>;
  listUsers(): Promise<User[]>;
  createUser(input: UserInput): Promise<User>;
  getCompany(): Promise<CompanySettings>;
  saveCompany(input: CompanyInput): Promise<CompanySettings>;
  listCustomers(search: string): Promise<Customer[]>;
  searchCustomers(search: string): Promise<CustomerSearchResult[]>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: string, input: CustomerInput): Promise<Customer>;
  archiveCustomer(id: string): Promise<void>;
  listEquipment(search: string): Promise<Equipment[]>;
  searchEquipment(search: string): Promise<EquipmentSearchResult[]>;
  createEquipment(input: EquipmentInput): Promise<Equipment>;
  updateEquipment(id: string, input: EquipmentInput): Promise<Equipment>;
  archiveEquipment(id: string): Promise<void>;
  launchRental(input: RentalLaunchInput): Promise<RentalDetail>;
  listRentals(filters: RentalFilters): Promise<PagedResult<RentalListItem>>;
  getRental(id: string): Promise<RentalDetail>;
  finalizeRental(id: string): Promise<RentalDetail>;
  saveRentalPdf(id: string): Promise<string | null>;
  printRental(id: string): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
  onSyncStatusChanged(listener: (status: SyncStatus) => void): () => void;
  getA20sConfig(): Promise<A20sSyncPublicConfig>;
  saveA20sConfig(input: A20sSyncConfigInput): Promise<A20sSyncPublicConfig>;
  testA20sConnection(input: A20sSyncConfigInput): Promise<SyncTestResult>;
  syncNow(): Promise<SyncStatus>;
}

export type EntityKind =
  | "customer"
  | "equipment"
  | "rental"
  | "user"
  | "company";
export type PeriodValue = RentalPeriod;
export type PaymentValue = PaymentMethod;
