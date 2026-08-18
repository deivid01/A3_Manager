import type {
  CustomerSearchResult,
  EquipmentSearchResult,
} from "../../domain/types";
import { getRentalRateForPeriod } from "../../domain/money";
import type { RentalLaunchInput } from "../../shared/contracts";

export interface SelectedRentalItem extends EquipmentSearchResult {
  quantity: number;
  unitRentalRateCents: number;
}

export interface DeliveryAddress {
  deliveryStreet: string;
  deliveryNeighborhood: string;
  deliveryNumber: string;
  deliveryCep: string;
  deliveryCity: string;
  deliveryState: RentalLaunchInput["deliveryState"];
}

export type RentalBaseForm = Omit<RentalLaunchInput, "customerId" | "items">;

export interface RentalFormState extends RentalBaseForm {
  deliveryMatchesCustomer: boolean;
  manualDeliveryAddress: DeliveryAddress;
}

export interface RentalLaunchStoredDraft {
  form: RentalFormState;
  customer: CustomerSearchResult | null;
  items: SelectedRentalItem[];
}

export function emptyDeliveryAddress(): DeliveryAddress {
  return {
    deliveryStreet: "",
    deliveryNeighborhood: "",
    deliveryNumber: "",
    deliveryCep: "",
    deliveryCity: "",
    deliveryState: "",
  };
}

export function buildInitialRentalForm(
  requestId: string = crypto.randomUUID(),
  startDate = new Date().toISOString().slice(0, 10),
): RentalFormState {
  return {
    ...emptyDeliveryAddress(),
    period: "MONTHLY",
    startDate,
    receiverIsCustomer: true,
    receiverName: "",
    receiverCpf: "",
    paymentMethod: "PIX",
    installments: null,
    clientRequestId: requestId,
    deliveryMatchesCustomer: true,
    manualDeliveryAddress: emptyDeliveryAddress(),
  };
}

export function customerDeliveryAddress(
  customer: CustomerSearchResult,
): DeliveryAddress {
  return {
    deliveryStreet: customer.street,
    deliveryNeighborhood: customer.neighborhood,
    deliveryNumber: customer.number,
    deliveryCep: customer.cep,
    deliveryCity: customer.city,
    deliveryState: customer.state as RentalLaunchInput["deliveryState"],
  };
}

export function applyDeliveryAddress(
  form: RentalFormState,
  address: DeliveryAddress,
): RentalFormState {
  return { ...form, ...address };
}

export function updateManualDeliveryAddress(
  form: RentalFormState,
  patch: Partial<DeliveryAddress>,
): RentalFormState {
  const manualDeliveryAddress = {
    ...form.manualDeliveryAddress,
    ...patch,
  };
  return {
    ...form,
    ...manualDeliveryAddress,
    manualDeliveryAddress,
  };
}

export function buildRentalLaunchForm(
  form: RentalFormState,
  customer: CustomerSearchResult | null,
): RentalBaseForm {
  const baseForm: RentalBaseForm = {
    period: form.period,
    startDate: form.startDate,
    deliveryStreet: form.deliveryStreet,
    deliveryNeighborhood: form.deliveryNeighborhood,
    deliveryNumber: form.deliveryNumber,
    deliveryCep: form.deliveryCep,
    deliveryCity: form.deliveryCity,
    deliveryState: form.deliveryState,
    receiverIsCustomer: form.receiverIsCustomer,
    receiverName: form.receiverName,
    receiverCpf: form.receiverCpf,
    paymentMethod: form.paymentMethod,
    installments: form.installments,
    clientRequestId: form.clientRequestId,
  };
  const deliveryAddress =
    form.deliveryMatchesCustomer && customer
      ? customerDeliveryAddress(customer)
      : pickDeliveryAddress(baseForm);

  return {
    ...baseForm,
    ...deliveryAddress,
  };
}

export function buildSelectedRentalItem(
  equipment: EquipmentSearchResult,
  period: RentalLaunchInput["period"],
): SelectedRentalItem {
  return {
    ...equipment,
    quantity: 1,
    unitRentalRateCents: getRentalRateForPeriod(equipment, period),
  };
}

export function recalculateSelectedRentalItemsForPeriod(
  items: SelectedRentalItem[],
  period: RentalLaunchInput["period"],
): SelectedRentalItem[] {
  return items.map((item) => ({
    ...item,
    unitRentalRateCents: getRentalRateForPeriod(item, period),
  }));
}

export function isMeaningfulRentalDraft(
  draft: RentalLaunchStoredDraft,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  const { form } = draft;
  return Boolean(
    draft.customer ||
      draft.items.length > 0 ||
      form.period !== "MONTHLY" ||
      form.startDate !== today ||
      !form.deliveryMatchesCustomer ||
      hasDeliveryAddressContent(form.manualDeliveryAddress) ||
      !form.receiverIsCustomer ||
      form.receiverName.trim() ||
      form.receiverCpf.trim() ||
      form.paymentMethod !== "PIX" ||
      form.installments,
  );
}

export function isRentalLaunchStoredDraft(
  value: unknown,
): value is RentalLaunchStoredDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RentalLaunchStoredDraft>;
  return (
    isRentalFormState(draft.form) &&
    (draft.customer === null || isCustomerSearchResult(draft.customer)) &&
    Array.isArray(draft.items) &&
    draft.items.every(isSelectedRentalItem)
  );
}

function pickDeliveryAddress(form: RentalBaseForm): DeliveryAddress {
  return {
    deliveryStreet: form.deliveryStreet,
    deliveryNeighborhood: form.deliveryNeighborhood,
    deliveryNumber: form.deliveryNumber,
    deliveryCep: form.deliveryCep,
    deliveryCity: form.deliveryCity,
    deliveryState: form.deliveryState,
  };
}

function hasDeliveryAddressContent(address: DeliveryAddress): boolean {
  return Boolean(
    address.deliveryStreet.trim() ||
      address.deliveryNeighborhood.trim() ||
      address.deliveryNumber.trim() ||
      address.deliveryCep.trim() ||
      address.deliveryCity.trim() ||
      address.deliveryState,
  );
}

function isRentalFormState(value: unknown): value is RentalFormState {
  if (!value || typeof value !== "object") return false;
  const form = value as Partial<Record<keyof RentalFormState, unknown>>;
  return (
    typeof form.period === "string" &&
    typeof form.startDate === "string" &&
    typeof form.deliveryStreet === "string" &&
    typeof form.deliveryNeighborhood === "string" &&
    typeof form.deliveryNumber === "string" &&
    typeof form.deliveryCep === "string" &&
    typeof form.deliveryCity === "string" &&
    typeof form.deliveryState === "string" &&
    typeof form.receiverIsCustomer === "boolean" &&
    typeof form.receiverName === "string" &&
    typeof form.receiverCpf === "string" &&
    typeof form.paymentMethod === "string" &&
    (typeof form.installments === "number" || form.installments === null) &&
    (typeof form.clientRequestId === "string" || form.clientRequestId === undefined) &&
    typeof form.deliveryMatchesCustomer === "boolean" &&
    isDeliveryAddress(form.manualDeliveryAddress)
  );
}

function isDeliveryAddress(value: unknown): value is DeliveryAddress {
  if (!value || typeof value !== "object") return false;
  const address = value as Partial<Record<keyof DeliveryAddress, unknown>>;
  return (
    typeof address.deliveryStreet === "string" &&
    typeof address.deliveryNeighborhood === "string" &&
    typeof address.deliveryNumber === "string" &&
    typeof address.deliveryCep === "string" &&
    typeof address.deliveryCity === "string" &&
    typeof address.deliveryState === "string"
  );
}

function isCustomerSearchResult(value: unknown): value is CustomerSearchResult {
  if (!value || typeof value !== "object") return false;
  const customer = value as Partial<Record<keyof CustomerSearchResult, unknown>>;
  return (
    typeof customer.id === "string" &&
    typeof customer.name === "string" &&
    typeof customer.cpf === "string" &&
    typeof customer.street === "string" &&
    typeof customer.neighborhood === "string" &&
    typeof customer.number === "string" &&
    typeof customer.cep === "string" &&
    typeof customer.city === "string" &&
    typeof customer.state === "string" &&
    typeof customer.contact === "string"
  );
}

function isSelectedRentalItem(value: unknown): value is SelectedRentalItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Record<keyof SelectedRentalItem, unknown>>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.stockQuantity === "number" &&
    typeof item.dailyRateCents === "number" &&
    typeof item.weeklyRateCents === "number" &&
    typeof item.biweeklyRateCents === "number" &&
    typeof item.monthlyRateCents === "number" &&
    typeof item.unitIndemnificationValueCents === "number" &&
    typeof item.unitRentalRateCents === "number" &&
    typeof item.quantity === "number"
  );
}
