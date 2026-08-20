import { CalendarDays, Check, CreditCard, Eraser, MapPin, Minus, PackagePlus, Plus, Search, Trash2, UserRound, UsersRound, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateReturnDate } from "../../domain/dateRules";
import {
  getCustomerDisplayName,
  getCustomerPrimaryDocument,
} from "../../domain/customerDisplay";
import { paymentLabels, periodLabels } from "../../domain/labels";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  formatCents
} from "../../domain/money";
import { formatCep } from "../../domain/normalization";
import { PAYMENT_METHODS, RENTAL_PERIODS, type CustomerSearchResult, type EquipmentSearchResult, type RentalDetail } from "../../domain/types";
import type { RentalLaunchInput } from "../../shared/contracts";
import { AppButton, ConfirmDialog, EmptyState, Field, IconButton, Message, PageHeader, SectionCard, SelectField, UfSelect } from "../components/Form";
import { Switch } from "../components/ui/switch";
import { CustomerSearchModal, EquipmentSearchModal, RentalReview, RentalSuccessModal } from "./RentalLaunchDialogs";
import {
  applyDeliveryAddress,
  buildSelectedRentalItem,
  buildInitialRentalForm,
  buildRentalLaunchForm,
  customerDeliveryAddress,
  emptyDeliveryAddress,
  isMeaningfulRentalDraft,
  isRentalLaunchStoredDraft,
  recalculateSelectedRentalItemsForPeriod,
  updateManualDeliveryAddress,
  type RentalFormState,
  type SelectedRentalItem,
} from "./rentalLaunchState";
import {
  buildDraftKey,
  getSessionDraftStorage,
  readStoredDraft,
  removeStoredDraft,
  useStoredDraft,
} from "../lib/formDrafts";

export function RentalLaunchView({ draftUserId }: { draftUserId: string }) {
  const draftKey = buildDraftKey(draftUserId, "rental-launch");
  const [restoredDraft] = useState(() =>
    readStoredDraft(getSessionDraftStorage(), draftKey, isRentalLaunchStoredDraft),
  );
  const [form, setForm] = useState<RentalFormState>(
    () => restoredDraft?.form ?? buildInitialRentalForm(),
  );
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(
    () => restoredDraft?.customer ?? null,
  );
  const [items, setItems] = useState<SelectedRentalItem[]>(
    () => restoredDraft?.items ?? [],
  );
  const [customerModal, setCustomerModal] = useState(false);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [lastRental, setLastRental] = useState<RentalDetail | null>(null);
  const [launching, setLaunching] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [message, setMessage] = useState(restoredDraft ? "Rascunho restaurado." : "");
  const [error, setError] = useState("");
  const draftValue = { form, customer, items };

  useStoredDraft({
    key: draftKey,
    value: draftValue,
    meaningful: isMeaningfulRentalDraft(draftValue),
  });

  const returnDate = useMemo(() => {
    try { return calculateReturnDate(form.startDate, form.period); }
    catch { return ""; }
  }, [form.startDate, form.period]);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const rentalTotals = calculateRentalMoneyTotals(items);

  async function launch() {
    if (launching) return;
    setError("");
    if (!customer) { setError("Selecione o cliente da locação."); return; }
    if (items.length === 0) { setError("Adicione ao menos um equipamento."); return; }

    setLaunching(true);
    try {
      const launchForm = buildRentalLaunchForm(form, customer);
      const rental = await window.a3.launchRental({
        ...launchForm,
        customerId: customer.id,
        installments: launchForm.paymentMethod === "CREDIT_CARD" ? launchForm.installments : null,
        items: items.map((item) => ({ equipmentId: item.id, quantity: item.quantity })),
      });
      setLastRental(rental);
      setItems([]);
      setCustomer(null);
      setForm(buildInitialRentalForm());
      setMessage("");
      removeStoredDraft(getSessionDraftStorage(), draftKey);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível lançar a locação.");
    } finally {
      setLaunching(false);
    }
  }

  function addEquipment(equipment: EquipmentSearchResult) {
    setItems((current) => current.some((item) => item.id === equipment.id)
      ? current
      : [...current, buildSelectedRentalItem(equipment, form.period)]);
    setEquipmentModal(false);
  }

  function changePeriod(period: RentalFormState["period"]) {
    setForm((current) => ({ ...current, period }));
    setItems((current) => recalculateSelectedRentalItemsForPeriod(current, period));
  }

  function changeQuantity(id: string, delta: number) {
    setItems((current) => current.map((item) => item.id === id
      ? { ...item, quantity: Math.min(item.stockQuantity, Math.max(1, item.quantity + delta)) }
      : item));
  }

  function selectCustomer(selected: CustomerSearchResult) {
    setCustomer(selected);
    setForm((current) => current.deliveryMatchesCustomer
      ? applyDeliveryAddress(current, customerDeliveryAddress(selected))
      : current);
    setCustomerModal(false);
  }

  function requestClearForm() {
    if (!isMeaningfulRentalDraft({ form, customer, items })) {
      resetRentalForm();
      return;
    }
    setClearConfirm(true);
  }

  function resetRentalForm() {
    setForm(buildInitialRentalForm());
    setCustomer(null);
    setItems([]);
    setError("");
    setMessage("");
    setClearConfirm(false);
    removeStoredDraft(getSessionDraftStorage(), draftKey);
  }

  return (
    <section className="view" data-screen="rental-launch">
      <PageHeader
        title="Nova locação"
        action={
          <AppButton
            variant="ghost"
            icon={<Eraser size={18} />}
            type="button"
            onClick={requestClearForm}
          >
            Limpar formulário
          </AppButton>
        }
      />
      {message && <Message kind="info">{message}</Message>}
      <div className="rental-launch-layout">
        <div className="rental-flow">
          <CustomerSection customer={customer} onSearch={() => setCustomerModal(true)} />
          <EquipmentSection
            items={items}
            onSearch={() => setEquipmentModal(true)}
            onQuantityChange={changeQuantity}
            onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
          />
          <PeriodSection
            form={form}
            returnDate={returnDate}
            onChange={setForm}
            onPeriodChange={changePeriod}
          />
          <DeliverySection customer={customer} form={form} onChange={setForm} />
          <PaymentSection form={form} onChange={setForm} />
        </div>
        <RentalReview
          customerName={customer ? getCustomerDisplayName(customer) : undefined}
          form={form}
          itemLines={items.length}
          totalQuantity={totalQuantity}
          totals={rentalTotals}
          returnDate={returnDate}
          error={error}
          launching={launching}
          onLaunch={() => void launch()}
        />
      </div>

      {customerModal && (
        <CustomerSearchModal
          onClose={() => setCustomerModal(false)}
          onSelect={selectCustomer}
        />
      )}
      {equipmentModal && (
        <EquipmentSearchModal
          selectedIds={items.map((item) => item.id)}
          onClose={() => setEquipmentModal(false)}
          onSelect={addEquipment}
        />
      )}
      {lastRental && <RentalSuccessModal rental={lastRental} onClose={() => setLastRental(null)} />}
      {clearConfirm && (
        <ConfirmDialog
          title="Limpar os dados desta locação?"
          description="Os dados preenchidos e o rascunho atual serão removidos."
          confirmLabel="Limpar"
          onClose={() => setClearConfirm(false)}
          onConfirm={resetRentalForm}
        >
          <p className="confirm-copy">
            Essa ação não altera clientes, equipamentos ou locações já salvas.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function CustomerSection({ customer, onSearch }: { customer: CustomerSearchResult | null; onSearch(): void }) {
  const document = customer ? getCustomerPrimaryDocument(customer) : null;
  const documentText = document?.value
    ? `${document.label} ${document.value}`
    : "Sem documento";

  return (
    <SectionCard
      title="1. Cliente"
      description="Selecione o cliente da locação."
      action={<AppButton variant="ghost" icon={<Search size={17} />} type="button" onClick={onSearch}>{customer ? "Trocar cliente" : "Buscar cliente"}</AppButton>}
    >
      {customer ? (
        <div className="selected-customer">
          <span className="selection-icon"><UserRound size={20} /></span>
          <div>
            <span>Cliente selecionado</span>
            <strong>{getCustomerDisplayName(customer)}</strong>
            <small>{documentText} · {customer.city || "Sem cidade"} · {customer.contact || "Sem contato"}</small>
          </div>
          <Check size={20} />
        </div>
      ) : (
        <EmptyState icon={<UsersRound size={25} />} title="Nenhum cliente selecionado" description="A busca só exibe resultados depois que você digitar nome, CPF ou CNPJ." />
      )}
    </SectionCard>
  );
}

function EquipmentSection({ items, onSearch, onQuantityChange, onRemove }: {
  items: SelectedRentalItem[];
  onSearch(): void;
  onQuantityChange(id: string, delta: number): void;
  onRemove(id: string): void;
}) {
  return (
    <SectionCard
      title="2. Equipamentos"
      description="Adicione itens e ajuste as quantidades dentro do estoque disponível."
      action={<AppButton variant="ghost" icon={<PackagePlus size={17} />} type="button" onClick={onSearch}>Adicionar equipamento</AppButton>}
    >
      {items.length === 0 ? (
        <EmptyState icon={<PackagePlus size={25} />} title="Nenhum equipamento adicionado" description="Os itens escolhidos aparecerão aqui para ajuste de quantidade." />
      ) : (
        <div className="selected-equipment-list">
          {items.map((item) => (
            <SelectedEquipmentItem
              item={item}
              key={item.id}
              onQuantityChange={onQuantityChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function SelectedEquipmentItem({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: SelectedRentalItem;
  onQuantityChange(id: string, delta: number): void;
  onRemove(id: string): void;
}) {
  const totals = calculateRentalItemTotals(item);

  return (
    <div className="selected-equipment">
      <div className="equipment-main">
        <strong>{item.name}</strong>
        <span>{item.stockQuantity} {item.stockQuantity === 1 ? "disponível" : "disponíveis"}</span>
      </div>
      <div className="quantity-stepper" aria-label={`Quantidade de ${item.name}`}>
        <IconButton type="button" title="Diminuir quantidade" onClick={() => onQuantityChange(item.id, -1)} disabled={item.quantity <= 1}><Minus size={15} /></IconButton>
        <strong>{item.quantity}</strong>
        <IconButton type="button" title="Aumentar quantidade" onClick={() => onQuantityChange(item.id, 1)} disabled={item.quantity >= item.stockQuantity}><Plus size={15} /></IconButton>
      </div>
      <dl className="equipment-money-grid">
        <div><dt>Valor unitário da locação</dt><dd>{formatCents(item.unitRentalRateCents)}</dd></div>
        <div className="item-grand-total"><dt>Subtotal da locação</dt><dd>{formatCents(totals.itemSubtotalCents)}</dd></div>
        <div><dt>Indenização unitária</dt><dd>{formatCents(item.unitIndemnificationValueCents)}</dd></div>
      </dl>
      <IconButton className="danger" type="button" title="Remover equipamento" onClick={() => onRemove(item.id)}><Trash2 size={17} /></IconButton>
    </div>
  );
}

function PeriodSection({
  form,
  returnDate,
  onChange,
  onPeriodChange,
}: {
  form: RentalFormState;
  returnDate: string;
  onChange(form: RentalFormState): void;
  onPeriodChange(period: RentalFormState["period"]): void;
}) {
  return (
    <SectionCard title="3. Período" description="A devolução é calculada automaticamente a partir da data inicial.">
      <div className="choice-group">
        <span className="field-label">Período da locação</span>
        <div className="choice-grid periods">
          {RENTAL_PERIODS.map((period) => (
            <button className={form.period === period ? "choice-button selected" : "choice-button"} key={period} type="button" onClick={() => onPeriodChange(period)}>
              <span>{periodLabels[period]}</span>{form.period === period && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
      <div className="date-row">
        <Field label="Data de início" type="date" value={form.startDate} onChange={(event) => onChange({ ...form, startDate: event.target.value })} />
        <div className="return-date"><CalendarDays size={20} /><div><span>Devolução prevista</span><strong>{returnDate ? formatDate(returnDate) : "Selecione uma data"}</strong></div></div>
      </div>
    </SectionCard>
  );
}

function PaymentSection({ form, onChange }: { form: RentalFormState; onChange(form: RentalFormState): void }) {
  return (
    <SectionCard title="5. Pagamento">
      <div className="choice-group">
        <span className="field-label">Forma de pagamento</span>
        <div className="choice-grid payments">
          {PAYMENT_METHODS.map((method) => (
            <button className={form.paymentMethod === method ? "choice-button selected" : "choice-button"} key={method} type="button" onClick={() => onChange({ ...form, paymentMethod: method, installments: method === "CREDIT_CARD" ? form.installments : null })}>
              {method === "PIX" ? <WalletCards size={18} /> : <CreditCard size={18} />}<span>{paymentLabels[method]}</span>
            </button>
          ))}
        </div>
      </div>
      {form.paymentMethod === "CREDIT_CARD" && (
        <SelectField label="Parcelas" value={form.installments ?? ""} onChange={(event) => onChange({ ...form, installments: Number(event.target.value) || null })}>
          <option value="">Selecione</option>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}x</option>)}
        </SelectField>
      )}
    </SectionCard>
  );
}

function DeliverySection({
  customer,
  form,
  onChange,
}: {
  customer: CustomerSearchResult | null;
  form: RentalFormState;
  onChange(form: RentalFormState): void;
}) {
  const stateLabel = form.deliveryMatchesCustomer ? "Sim" : "Não";

  function changeDeliveryMode(checked: boolean) {
    const nextForm = { ...form, deliveryMatchesCustomer: checked };
    if (checked) {
      onChange(applyDeliveryAddress(
        nextForm,
        customer ? customerDeliveryAddress(customer) : emptyDeliveryAddress(),
      ));
      return;
    }

    onChange(applyDeliveryAddress(nextForm, form.manualDeliveryAddress));
  }

  return (
    <SectionCard title="4. Entrega">
      <div className="switch-row">
        <Switch
          checked={form.deliveryMatchesCustomer}
          disabled={!customer}
          aria-label="O endereço de entrega é o mesmo do cliente?"
          onCheckedChange={changeDeliveryMode}
        />
        <div><strong>O endereço de entrega é o mesmo do cliente?</strong></div>
        <span className={form.deliveryMatchesCustomer ? "switch-state yes" : "switch-state no"}>{stateLabel}</span>
      </div>
      {form.deliveryMatchesCustomer ? (
        <DeliveryPreview customer={customer} />
      ) : (
        <div className="form-grid address delivery-fields">
          <Field className="span-two" label="Rua" value={form.deliveryStreet} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryStreet: event.target.value }))} />
          <Field label="Número" value={form.deliveryNumber} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryNumber: event.target.value }))} />
          <Field label="Bairro" value={form.deliveryNeighborhood} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryNeighborhood: event.target.value }))} />
          <Field label="CEP" value={form.deliveryCep} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryCep: formatCep(event.target.value) }))} />
          <Field label="Cidade" value={form.deliveryCity} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryCity: event.target.value }))} />
          <UfSelect allowEmpty value={form.deliveryState} onChange={(event) => onChange(updateManualDeliveryAddress(form, { deliveryState: event.target.value as RentalLaunchInput["deliveryState"] }))} />
        </div>
      )}
    </SectionCard>
  );
}

function DeliveryPreview({ customer }: { customer: CustomerSearchResult | null }) {
  if (!customer) {
    return (
      <div className="address-preview empty">
        <MapPin size={18} />
        <span>Selecione um cliente para usar o endereço cadastrado.</span>
      </div>
    );
  }

  return (
    <div className="address-preview">
      <MapPin size={18} />
      <div>
        <strong>{customer.street}, {customer.number}</strong>
        <span>{customer.neighborhood} · {customer.cep} · {customer.city}/{customer.state}</span>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
