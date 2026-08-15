import { FileDown, Printer, Search, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { paymentLabels, periodLabels } from "../../domain/labels";
import { formatCents } from "../../domain/money";
import { formatCep, formatCpf } from "../../domain/normalization";
import { PAYMENT_METHODS, RENTAL_PERIODS } from "../../domain/types";
import type { CustomerSearchResult, EquipmentSearchResult, RentalDetail } from "../../domain/types";
import type { RentalLaunchInput } from "../../shared/contracts";
import { Field, Message, SelectField, UfSelect } from "../components/Form";

interface SelectedItem extends EquipmentSearchResult {
  quantity: number;
}

const initialForm: Omit<RentalLaunchInput, "customerId" | "items"> = {
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
  clientRequestId: crypto.randomUUID()
};

export function RentalLaunchView() {
  const [form, setForm] = useState(initialForm);
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [customerModal, setCustomerModal] = useState(false);
  const [equipmentModal, setEquipmentModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastRental, setLastRental] = useState<RentalDetail | null>(null);
  const [launching, setLaunching] = useState(false);

  const totalIndemnification = useMemo(
    () => items.reduce((total, item) => total + item.quantity * item.unitIndemnificationValueCents, 0),
    [items]
  );

  async function launch() {
    if (launching) {
      return;
    }

    setError("");
    setMessage("");
    setLastRental(null);
    if (!customer) {
      setError("Selecione o cliente da locação.");
      return;
    }

    setLaunching(true);
    try {
      const rental = await window.a3.launchRental({
        ...form,
        customerId: customer.id,
        installments: form.paymentMethod === "CREDIT_CARD" ? form.installments : null,
        items: items.map((item) => ({ equipmentId: item.id, quantity: item.quantity }))
      });
      setLastRental(rental);
      setMessage(`Locação ${rental.code} lançada com sucesso.`);
      setItems([]);
      setCustomer(null);
      setForm({ ...initialForm, clientRequestId: crypto.randomUUID() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível lançar a locação.");
    } finally {
      setLaunching(false);
    }
  }

  function addEquipment(equipment: EquipmentSearchResult) {
    setItems((current) => {
      if (current.some((item) => item.id === equipment.id)) {
        return current;
      }
      return [...current, { ...equipment, quantity: Math.min(1, equipment.stockQuantity) }];
    });
    setEquipmentModal(false);
  }

  function changeQuantity(id: string, quantity: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, quantity: Math.min(Math.max(1, quantity), item.stockQuantity) } : item
      )
    );
  }

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>Nova locação</h1>
          <p>Lançamento com baixa transacional de estoque.</p>
        </div>
      </header>

      <div className="launch-grid">
        <section className="panel form-grid">
          <h2>Cliente e período</h2>
          <button className="selector-button" type="button" onClick={() => setCustomerModal(true)}>
            <Search size={18} />
            {customer ? `${customer.name} - ${customer.cpf}` : "Selecionar cliente"}
          </button>
          <SelectField label="Período" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as RentalLaunchInput["period"] })}>
            {RENTAL_PERIODS.map((period) => (
              <option key={period} value={period}>
                {periodLabels[period]}
              </option>
            ))}
          </SelectField>
          <Field label="Data de início" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <SelectField label="Pagamento" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as RentalLaunchInput["paymentMethod"] })}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {paymentLabels[method]}
              </option>
            ))}
          </SelectField>
          {form.paymentMethod === "CREDIT_CARD" && (
            <Field
              label="Parcelas"
              min="1"
              type="number"
              value={form.installments ?? ""}
              onChange={(e) => setForm({ ...form, installments: Number(e.target.value) || null })}
            />
          )}
        </section>

        <section className="panel form-grid">
          <h2>Entrega</h2>
          <Field label="Rua" value={form.deliveryStreet} onChange={(e) => setForm({ ...form, deliveryStreet: e.target.value })} />
          <Field label="Número" value={form.deliveryNumber} onChange={(e) => setForm({ ...form, deliveryNumber: e.target.value })} />
          <Field label="Bairro" value={form.deliveryNeighborhood} onChange={(e) => setForm({ ...form, deliveryNeighborhood: e.target.value })} />
          <Field label="CEP" value={form.deliveryCep} onChange={(e) => setForm({ ...form, deliveryCep: formatCep(e.target.value) })} />
          <Field label="Cidade" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} />
          <UfSelect allowEmpty value={form.deliveryState} onChange={(e) => setForm({ ...form, deliveryState: e.target.value as RentalLaunchInput["deliveryState"] })} />
          <label className="toggle-row">
            <input
              checked={form.receiverIsCustomer}
              type="checkbox"
              onChange={(e) => setForm({ ...form, receiverIsCustomer: e.target.checked })}
            />
            <span>O locatário receberá os equipamentos</span>
          </label>
          {!form.receiverIsCustomer && (
            <>
              <Field label="Nome do recebedor" value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} />
              <Field label="CPF do recebedor" value={form.receiverCpf} onChange={(e) => setForm({ ...form, receiverCpf: formatCpf(e.target.value) })} />
            </>
          )}
        </section>

        <section className="panel equipment-panel">
          <div className="panel-title-row">
            <h2>Equipamentos</h2>
            <button className="ghost-button" type="button" onClick={() => setEquipmentModal(true)}>
              <Search size={18} />
              Adicionar
            </button>
          </div>
          {items.length === 0 ? (
            <div className="empty-state">Nenhum equipamento selecionado.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Estoque</th>
                    <th>Qtd.</th>
                    <th>Indenização</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.stockQuantity}</td>
                      <td>
                        <input
                          className="qty-input"
                          min="1"
                          max={item.stockQuantity}
                          type="number"
                          value={item.quantity}
                          onChange={(e) => changeQuantity(item.id, Number(e.target.value))}
                        />
                      </td>
                      <td>{formatCents(item.quantity * item.unitIndemnificationValueCents)}</td>
                      <td>
                        <button className="icon-button danger" type="button" title="Remover" onClick={() => setItems(items.filter((row) => row.id !== item.id))}>
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="summary-line">
            <strong>Total de indenização:</strong>
            <span>{formatCents(totalIndemnification)}</span>
          </div>
          {error && <Message kind="error">{error}</Message>}
          {message && <Message kind="success">{message}</Message>}
          {lastRental && (
            <div className="actions">
              <button className="ghost-button" type="button" onClick={() => window.a3.saveRentalPdf(lastRental.id)}>
                <FileDown size={18} />
                Salvar PDF
              </button>
              <button className="ghost-button" type="button" onClick={() => window.a3.printRental(lastRental.id)}>
                <Printer size={18} />
                Imprimir
              </button>
            </div>
          )}
          <button className="primary-button" disabled={launching} type="button" onClick={() => void launch()}>
            <Send size={18} />
            {launching ? "Lançando..." : "Lançar locação"}
          </button>
        </section>
      </div>

      {customerModal && (
        <CustomerSearchModal
          onClose={() => setCustomerModal(false)}
          onSelect={(selected) => {
            setCustomer(selected);
            setCustomerModal(false);
            setMessage("Cliente selecionado e dados carregados.");
          }}
        />
      )}
      {equipmentModal && (
        <EquipmentSearchModal onClose={() => setEquipmentModal(false)} onSelect={addEquipment} />
      )}
    </section>
  );
}

function CustomerSearchModal({
  onClose,
  onSelect
}: {
  onClose(): void;
  onSelect(customer: CustomerSearchResult): void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      window.a3.searchCustomers(search).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header>
          <h2>Selecionar cliente</h2>
          <button className="icon-button" type="button" title="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label className="search-field modal-search">
          <Search size={17} />
          <input autoFocus placeholder="Digite nome ou CPF" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <SearchResults
          emptyText="Digite ao menos 2 letras ou 3 números para buscar."
          rows={results.map((customer) => ({
            id: customer.id,
            title: customer.name,
            subtitle: `${customer.cpf} · ${customer.city}`,
            onClick: () => onSelect(customer)
          }))}
        />
      </section>
    </div>
  );
}

function EquipmentSearchModal({
  onClose,
  onSelect
}: {
  onClose(): void;
  onSelect(equipment: EquipmentSearchResult): void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EquipmentSearchResult[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      window.a3.searchEquipment(search).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <header>
          <h2>Selecionar equipamento</h2>
          <button className="icon-button" type="button" title="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <label className="search-field modal-search">
          <Search size={17} />
          <input autoFocus placeholder="Digite o nome do equipamento" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <SearchResults
          emptyText="Digite ao menos 2 letras para buscar."
          rows={results.map((equipment) => ({
            id: equipment.id,
            title: equipment.name,
            subtitle: `Estoque disponível: ${equipment.stockQuantity}`,
            disabled: equipment.stockQuantity <= 0,
            onClick: () => onSelect(equipment)
          }))}
        />
      </section>
    </div>
  );
}

function SearchResults({
  rows,
  emptyText
}: {
  rows: Array<{ id: string; title: string; subtitle: string; disabled?: boolean; onClick(): void }>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="search-results">
      {rows.map((row) => (
        <button key={row.id} disabled={row.disabled} type="button" onClick={row.onClick}>
          <strong>{row.title}</strong>
          <span>{row.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
