import type { PaymentMethod, RentalPeriod, RentalStatus, UserRole } from "./types";

export const periodLabels: Record<
  RentalPeriod | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL",
  string
> = {
  DAILY: "Diária",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUAL: "Semestral",
  ANNUAL: "Anual"
};

export const paymentLabels: Record<PaymentMethod, string> = {
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  CASH: "Dinheiro",
  PIX: "Pix",
  BOLETO: "Boleto"
};

export const rentalStatusLabels: Record<RentalStatus, string> = {
  ONGOING: "Em andamento",
  FINALIZED: "Finalizada"
};

export const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  USER: "Usuário"
};
