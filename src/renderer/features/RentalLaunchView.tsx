import { CalendarDays, Check, CreditCard, Minus, PackagePlus, Plus, Search, Trash2, UserRound, UsersRound, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateReturnDate } from "../../domain/dateRules";
import { paymentLabels, periodLabels } from "../../domain/labels";
import { formatCents } from "../../domain/money";
import { formatCep, formatCpf } from "../../domain/normalization";
import { PAYMENT_METHODS, RENTAL_PERIODS, type CustomerSearchResult, type EquipmentSearchResult, type RentalDetail } from "../../domain/types";
import type { RentalLaunchInput } from "../../shared/contracts";
import { AppButton, EmptyState, Field, IconButton, PageHeader, SectionCard, SelectField, UfSelect } from "../components/Form";
import { CustomerSearchModal, EquipmentSearchModal, RentalReview, RentalSuccessModal } from "./RentalLaunchDialogs";

interface SelectedItem extends EquipmentSearchResult { quantity: number; }
type RentalDraft = Omit<RentalLaunchInput, "customerId" | "items">;

function buildInitialForm(): RentalDraft {
  return {
    period: "MONTHLY",
    startDate: new Date().toISOString().slice(0, 10),
    deliveryStreet: "",
    deliveryNeighborhood: "",
    deliveryNumber: "",
    deliveryCep: "",
    deliveryCity: "",
    deliveryState: "",
    receiverIsCustomer: true,
    receiverName: "",
    receiverCpf: "",
    paymentMethod: "PIX",
    installments: null,
    clientRequestId: crypto.randomUUID(),
  };
}

export function RentalLaunchView() {
  const [form, setForm] = useState(buildInitialForm);
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [customerModal, setCustomerModal] = useState(false);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [lastRental, setLastRental] = useState<RentalDetail | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const returnDate = useMemo(() => {
    try { return calculateReturnDate(form.startDate, form.period); }
    catch { return ""; }
  }, [form.startDate, form.period]);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalIndemnification = items.reduce(
    (sum, item) => sum + item.quantity * item.unitIndemnificationValueCents,
    0,
  );

  async function launch() {
    if (launching) return;
    setError("");
    if (!customer) { setError("Selecione o cliente da locação."); return; }
    if (items.length === 0) { setError("Adicione ao menos um equipamento."); return; }

    setLaunching(true);
    try {
      const rental = await window.a3.launchRental({
        ...form,
        customerId: customer.id,
        installments: form.paymentMethod === "CREDIT_CARD" ? form.installments : null,
        items: items.map((item) => ({ equipmentId: item.id, quantity: item.quantity })),
      });
      setLastRental(rental);
      setItems([]);
      setCustomer(null);
      setForm(buildInitialForm());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível lançar a locação.");
    } finally {
      setLaunching(false);
    }
  }

  function addEquipment(equipment: EquipmentSearchResult) {
    setItems((current) => current.some((item) => item.id === equipment.id)
      ? current
      : [...current, { ...equipment, quantity: 1 }]);
    setEquipmentModal(false);
  }

  function changeQuantity(id: string, delta: number) {
    setItems((current) => current.map((item) => item.id === id
      ? { ...item, quantity: Math.min(item.stockQuantity, Math.max(1, item.quantity + delta)) }
      : item));
  }

  return (
    <section className="view" data-screen="rental-launch">
      <PageHeader
        title="Nova locação"
      />
      <div className="rental-launch-layout">
        <div className="rental-flow">
          <CustomerSection customer={customer} onSearch={() => setCustomerModal(true)} />
          <EquipmentSection
            items={items}
            onSearch={() => setEquipmentModal(true)}
            onQuantityChange={changeQuantity}
            onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
          />
          <PeriodAndPaymentSection form={form} returnDate={returnDate} onChange={setForm} />
          <DeliverySection form={form} onChange={setForm} />
        </div>
        <RentalReview
          customerName={customer?.name}
          form={form}
          totalQuantity={totalQuantity}
          totalIndemnification={totalIndemnification}
          returnDate={returnDate}
          error={error}
          launching={launching}
          onLaunch={() => void launch()}
        />
      </div>

      {customerModal && (
        <CustomerSearchModal
          onClose={() => setCustomerModal(false)}
          onSelect={(selected) => { setCustomer(selected); setCustomerModal(false); }}
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
    </section>
  );
}

function CustomerSection({ customer, onSearch }: { customer: CustomerSearchResult | null; onSearch(): void }) {
  return (
    <SectionCard
      title="1. Cliente"
      description="Selecione quem ficará responsável pela locação."
      action={<AppButton variant="ghost" icon={<Search size={17} />} type="button" onClick={onSearch}>{customer ? "Trocar cliente" : "Buscar cliente"}</AppButton>}
    >
      {customer ? (
        <div className="selected-customer">
          <span className="selection-icon"><UserRound size={20} /></span>
          <div>
            <span>Cliente selecionado</span>
            <strong>{customer.name}</strong>
            <small>{customer.cpf} · {customer.city} · {customer.contact || "Sem contato"}</small>
          </div>
          <Check size={20} />
        </div>
      ) : (
        <EmptyState icon={<UsersRound size={25} />} title="Nenhum cliente selecionado" description="A busca só exibe resultados depois que você digitar nome ou CPF." />
      )}
    </SectionCard>
  );
}

function EquipmentSection({ items, onSearch, onQuantityChange, onRemove }: {
  items: SelectedItem[];
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
            <div className="selected-equipment" key={item.id}>
              <div className="equipment-main">
                <strong>{item.name}</strong>
                <span>{item.stockQuantity} disponível{item.stockQuantity === 1 ? "" : "is"} · {formatCents(item.unitIndemnificationValueCents)} por unidade</span>
              </div>
              <div className="quantity-stepper" aria-label={`Quantidade de ${item.name}`}>
                <IconButton type="button" title="Diminuir quantidade" onClick={() => onQuantityChange(item.id, -1)} disabled={item.quantity <= 1}><Minus size={15} /></IconButton>
                <strong>{item.quantity}</strong>
                <IconButton type="button" title="Aumentar quantidade" onClick={() => onQuantityChange(item.id, 1)} disabled={item.quantity >= item.stockQuantity}><Plus size={15} /></IconButton>
              </div>
              <strong className="equipment-total">{formatCents(item.quantity * item.unitIndemnificationValueCents)}</strong>
              <IconButton className="danger" type="button" title="Remover equipamento" onClick={() => onRemove(item.id)}><Trash2 size={17} /></IconButton>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function PeriodAndPaymentSection({ form, returnDate, onChange }: { form: RentalDraft; returnDate: string; onChange(form: RentalDraft): void }) {
  return (
    <SectionCard title="3. Período e pagamento" description="A devolução é calculada automaticamente a partir da data inicial.">
      <div className="choice-group">
        <span className="field-label">Período da locação</span>
        <div className="choice-grid periods">
          {RENTAL_PERIODS.map((period) => (
            <button className={form.period === period ? "choice-button selected" : "choice-button"} key={period} type="button" onClick={() => onChange({ ...form, period })}>
              <span>{periodLabels[period]}</span>{form.period === period && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
      <div className="date-row">
        <Field label="Data de início" type="date" value={form.startDate} onChange={(event) => onChange({ ...form, startDate: event.target.value })} />
        <div className="return-date"><CalendarDays size={20} /><div><span>Devolução prevista</span><strong>{returnDate ? formatDate(returnDate) : "Selecione uma data"}</strong></div></div>
      </div>
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

function DeliverySection({ form, onChange }: { form: RentalDraft; onChange(form: RentalDraft): void }) {
  const receiverStateLabel = form.receiverIsCustomer ? "Sim" : "Não";

  return (
    <SectionCard title="4. Entrega e recebedor">
      <div className="form-grid address">
        <Field className="span-two" label="Rua" value={form.deliveryStreet} onChange={(event) => onChange({ ...form, deliveryStreet: event.target.value })} />
        <Field label="Número" value={form.deliveryNumber} onChange={(event) => onChange({ ...form, deliveryNumber: event.target.value })} />
        <Field label="Bairro" value={form.deliveryNeighborhood} onChange={(event) => onChange({ ...form, deliveryNeighborhood: event.target.value })} />
        <Field label="CEP" value={form.deliveryCep} onChange={(event) => onChange({ ...form, deliveryCep: formatCep(event.target.value) })} />
        <Field label="Cidade" value={form.deliveryCity} onChange={(event) => onChange({ ...form, deliveryCity: event.target.value })} />
        <UfSelect allowEmpty value={form.deliveryState} onChange={(event) => onChange({ ...form, deliveryState: event.target.value as RentalLaunchInput["deliveryState"] })} />
      </div>
      <label className="switch-row">
        <input
          aria-checked={form.receiverIsCustomer}
          checked={form.receiverIsCustomer}
          role="switch"
          type="checkbox"
          onChange={(event) => onChange({ ...form, receiverIsCustomer: event.target.checked })}
        />
        <span className="switch-control" />
        <div><strong>O cliente receberá os equipamentos?</strong></div>
        <span className={form.receiverIsCustomer ? "switch-state yes" : "switch-state no"}>{receiverStateLabel}</span>
      </label>
      {!form.receiverIsCustomer && (
        <div className="form-grid two receiver-fields">
          <Field label="Nome do recebedor" value={form.receiverName} onChange={(event) => onChange({ ...form, receiverName: event.target.value })} />
          <Field label="CPF do recebedor" value={form.receiverCpf} onChange={(event) => onChange({ ...form, receiverCpf: formatCpf(event.target.value) })} />
        </div>
      )}
    </SectionCard>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
