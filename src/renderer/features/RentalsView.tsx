import { CheckCircle2, FileDown, Printer, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import { formatCents } from "../../domain/money";
import type { PagedResult, RentalDetail, RentalListItem } from "../../domain/types";
import type { RentalFilters } from "../../shared/contracts";
import { EmptyState, Field, Message, SelectField } from "../components/Form";

const defaultFilters: RentalFilters = {
  status: "ALL",
  code: "",
  customerName: "",
  startDate: "",
  endDate: "",
  page: 1,
  pageSize: 10
};

export function RentalsView() {
  const [filters, setFilters] = useState<RentalFilters>(defaultFilters);
  const [result, setResult] = useState<PagedResult<RentalListItem>>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 10
  });
  const [selected, setSelected] = useState<RentalDetail | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load(defaultFilters, false);
  }, []);

  async function load(nextFilters = filters, append: boolean) {
    setError("");
    try {
      const page = await window.a3.listRentals(nextFilters);
      setResult((current) => ({
        ...page,
        rows: append ? [...current.rows, ...page.rows] : page.rows
      }));
      setFilters(nextFilters);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar as locações.");
    }
  }

  async function openDetail(id: string) {
    setSelected(await window.a3.getRental(id));
  }

  async function finalizeRental(id: string) {
    setError("");
    setMessage("");
    try {
      const rental = await window.a3.finalizeRental(id);
      setSelected(rental);
      setMessage("Locação finalizada e estoque restaurado.");
      await load({ ...filters, page: 1 }, false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível finalizar a locação.");
    }
  }

  const hasMore = result.rows.length < result.total;

  return (
    <section className="view">
      <header className="view-header">
        <div>
          <h1>Relatórios</h1>
          <p>Locações em andamento e finalizadas.</p>
        </div>
      </header>

      <div className="report-grid">
        <section className="panel">
          <div className="filters">
            <SelectField label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as RentalFilters["status"] })}>
              <option value="ALL">Todos</option>
              <option value="ONGOING">Em andamento</option>
              <option value="FINALIZED">Finalizadas</option>
            </SelectField>
            <Field label="Código" value={filters.code ?? ""} onChange={(e) => setFilters({ ...filters, code: e.target.value })} />
            <Field label="Locatário" value={filters.customerName ?? ""} onChange={(e) => setFilters({ ...filters, customerName: e.target.value })} />
            <Field label="Início de" type="date" value={filters.startDate ?? ""} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
            <Field label="Início até" type="date" value={filters.endDate ?? ""} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
            <button className="primary-button filter-button" type="button" onClick={() => void load({ ...filters, page: 1 }, false)}>
              <Search size={18} />
              Buscar
            </button>
          </div>
          {error && <Message kind="error">{error}</Message>}
          {message && <Message kind="success">{message}</Message>}
          {result.rows.length === 0 ? (
            <EmptyState>Nenhuma locação encontrada.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Locatário</th>
                    <th>Status</th>
                    <th>Início</th>
                    <th>Devolução</th>
                    <th>Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((rental) => (
                    <tr key={rental.id} className="clickable-row" onClick={() => void openDetail(rental.id)}>
                      <td>{rental.code}</td>
                      <td>{rental.customerName}</td>
                      <td>{rentalStatusLabels[rental.status]}</td>
                      <td>{formatDate(rental.startDate)}</td>
                      <td>{formatDate(rental.returnDate)}</td>
                      <td>{rental.totalItems}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <button className="ghost-button load-more" type="button" onClick={() => void load({ ...filters, page: (filters.page ?? 1) + 1 }, true)}>
              <RotateCcw size={18} />
              Carregar mais
            </button>
          )}
        </section>

        <aside className="panel detail-panel">
          {!selected ? (
            <EmptyState>Selecione uma locação para ver os detalhes.</EmptyState>
          ) : (
            <RentalDetailPanel rental={selected} onFinalize={finalizeRental} />
          )}
        </aside>
      </div>
    </section>
  );
}

function RentalDetailPanel({
  rental,
  onFinalize
}: {
  rental: RentalDetail;
  onFinalize(id: string): Promise<void>;
}) {
  const totalIndemnification = rental.items.reduce(
    (total, item) => total + item.quantity * item.unitIndemnificationValueCents,
    0
  );

  return (
    <div className="detail-content">
      <header>
        <div>
          <h2>{rental.code}</h2>
          <span className={`status-pill ${rental.status.toLowerCase()}`}>{rentalStatusLabels[rental.status]}</span>
        </div>
      </header>
      <dl className="detail-list">
        <div>
          <dt>Locatário</dt>
          <dd>{rental.customerSnapshot.name}</dd>
        </div>
        <div>
          <dt>Período</dt>
          <dd>{periodLabels[rental.period]}</dd>
        </div>
        <div>
          <dt>Datas</dt>
          <dd>{formatDate(rental.startDate)} a {formatDate(rental.returnDate)}</dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>{paymentLabels[rental.paymentMethod]}{rental.installments ? ` em ${rental.installments} parcela(s)` : ""}</dd>
        </div>
        <div>
          <dt>Recebedor</dt>
          <dd>{rental.receiverIsCustomer ? "O próprio locatário" : `${rental.receiverName} - ${rental.receiverCpf}`}</dd>
        </div>
      </dl>

      <div className="table-wrap compact">
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Qtd.</th>
              <th>Indenização</th>
            </tr>
          </thead>
          <tbody>
            {rental.items.map((item) => (
              <tr key={item.id}>
                <td>{item.nameSnapshot}</td>
                <td>{item.quantity}</td>
                <td>{formatCents(item.quantity * item.unitIndemnificationValueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="summary-line">
        <strong>Total de indenização:</strong>
        <span>{formatCents(totalIndemnification)}</span>
      </div>
      <div className="actions wrap">
        <button className="ghost-button" type="button" onClick={() => window.a3.saveRentalPdf(rental.id)}>
          <FileDown size={18} />
          PDF
        </button>
        <button className="ghost-button" type="button" onClick={() => window.a3.printRental(rental.id)}>
          <Printer size={18} />
          Imprimir
        </button>
        {rental.status === "ONGOING" && (
          <button className="primary-button" type="button" onClick={() => void onFinalize(rental.id)}>
            <CheckCircle2 size={18} />
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
