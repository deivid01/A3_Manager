import { Archive, ArchiveRestore, CalendarDays, CheckCircle2, ChevronRight, Filter, Package, ReceiptText, RotateCcw, Search, SearchX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { rentalStatusLabels } from "../../domain/labels";
import { getRentalExpirationAlert, type RentalExpirationState } from "../../domain/rentalExpiration";
import type { PagedResult, RentalDetail, RentalListItem } from "../../domain/types";
import type { RentalFilters } from "../../shared/contracts";
import { AppButton, EmptyState, Field, Message, Modal, PageHeader, SelectField, StatusBadge } from "../components/Form";
import { RentalDetailModal } from "./RentalDetailModal";

const defaultFilters: RentalFilters = {
  status: "ALL",
  archiveStatus: "UNARCHIVED",
  code: "",
  customerName: "",
  startDate: "",
  endDate: "",
  page: 1,
  pageSize: 10,
};

export function RentalsView() {
  const [filters, setFilters] = useState<RentalFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<RentalFilters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [result, setResult] = useState<PagedResult<RentalListItem>>({ rows: [], total: 0, page: 1, pageSize: 10 });
  const [selected, setSelected] = useState<RentalDetail | null>(null);
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void load(defaultFilters, false); }, []);

  async function load(nextFilters: RentalFilters, append: boolean) {
    setError("");
    setLoading(true);
    try {
      const page = await window.a3.listRentals(nextFilters);
      setResult((current) => ({ ...page, rows: append ? [...current.rows, ...page.rows] : page.rows }));
      setAppliedFilters(nextFilters);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar as locações.");
    } finally {
      setLoading(false);
    }
  }

  async function applyFilters() {
    await load({ ...filters, page: 1 }, false);
    setFiltersOpen(false);
  }

  async function clearFilters() {
    setFilters(defaultFilters);
    await load(defaultFilters, false);
  }

  async function openDetail(id: string) {
    setError("");
    try { setSelected(await window.a3.getRental(id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível abrir a locação."); }
  }

  async function finalizeRental() {
    if (!selected) return;
    setFinalizeConfirm(false);
    setError("");
    setMessage("");
    try {
      setSelected(await window.a3.finalizeRental(selected.id));
      setMessage("Locação finalizada e estoque restaurado.");
      await load({ ...appliedFilters, page: 1 }, false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível finalizar a locação.");
    }
  }

  async function toggleArchiveRental(id: string, archived: boolean) {
    setError("");
    setMessage("");
    try {
      const updated = archived
        ? await window.a3.unarchiveRental(id)
        : await window.a3.archiveRental(id);
      setSelected((current) => (current?.id === id ? updated : current));
      setMessage(archived ? "Locação desarquivada." : "Locação arquivada.");
      await load({ ...appliedFilters, page: 1 }, false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o arquivamento.");
    }
  }

  const activeFilters = useMemo(() => [
    appliedFilters.status && appliedFilters.status !== "ALL" ? rentalStatusLabels[appliedFilters.status] : "",
    appliedFilters.archiveStatus === "ARCHIVED" ? "Arquivados" : "",
    appliedFilters.archiveStatus === "ALL" ? "Todos os arquivos" : "",
    appliedFilters.code ? `Código: ${appliedFilters.code}` : "",
    appliedFilters.customerName ? `Cliente: ${appliedFilters.customerName}` : "",
    appliedFilters.startDate ? `A partir de ${formatDate(appliedFilters.startDate)}` : "",
    appliedFilters.endDate ? `Até ${formatDate(appliedFilters.endDate)}` : "",
  ].filter(Boolean), [appliedFilters]);
  const hasMore = result.rows.length < result.total;

  return (
    <section className="view" data-screen="rentals">
      <PageHeader
        title="Relatórios"
        description="Locações em andamento, devoluções e histórico."
        action={
          <AppButton
            variant={filtersOpen ? "secondary" : "primary"}
            icon={filtersOpen ? <X size={18} /> : <Filter size={18} />}
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            {filtersOpen ? "Fechar filtros" : "Filtrar"}
          </AppButton>
        }
      />

      {filtersOpen && (
        <section className="filter-panel" aria-label="Filtros de locações">
          <div className="filter-grid">
            <SelectField label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as RentalFilters["status"] })}>
              <option value="ALL">Todos</option><option value="ONGOING">Em andamento</option><option value="FINALIZED">Finalizadas</option>
            </SelectField>
            <SelectField label="Arquivo" value={filters.archiveStatus} onChange={(event) => setFilters({ ...filters, archiveStatus: event.target.value as RentalFilters["archiveStatus"] })}>
              <option value="UNARCHIVED">Não arquivados</option><option value="ARCHIVED">Arquivados</option><option value="ALL">Todos</option>
            </SelectField>
            <Field label="Código" placeholder="LOC-..." value={filters.code ?? ""} onChange={(event) => setFilters({ ...filters, code: event.target.value })} />
            <Field label="Cliente" placeholder="Nome do locatário" value={filters.customerName ?? ""} onChange={(event) => setFilters({ ...filters, customerName: event.target.value })} />
            <Field label="Início de" type="date" value={filters.startDate ?? ""} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
            <Field label="Início até" type="date" value={filters.endDate ?? ""} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </div>
          <div className="filter-actions">
            <AppButton type="button" variant="ghost" onClick={() => void clearFilters()}>Limpar</AppButton>
            <AppButton type="button" variant="primary" icon={<Search size={18} />} onClick={() => void applyFilters()}>Aplicar filtros</AppButton>
          </div>
        </section>
      )}

      {activeFilters.length > 0 && (
        <div className="active-filters">
          <span>Filtros ativos</span>
          {activeFilters.map((filter) => <span className="filter-chip" key={filter}>{filter}</span>)}
          <button type="button" onClick={() => void clearFilters()}>Limpar todos</button>
        </div>
      )}
      {error && <Message kind="error">{error}</Message>}
      {message && <Message kind="success">{message}</Message>}

      <section className="rental-results" aria-busy={loading}>
        <header className="results-header">
          <div><strong>{result.total} locação{result.total === 1 ? "" : "ões"}</strong><span>Exibindo em lotes de 10 registros</span></div>
        </header>
        {loading && result.rows.length === 0 ? (
          <div className="loading-state"><span className="loading-spinner" />Carregando locações</div>
        ) : result.rows.length === 0 ? (
          <EmptyState
            icon={<SearchX size={26} />}
            title="Nenhuma locação encontrada"
            description={activeFilters.length ? "Revise os filtros aplicados para ampliar a consulta." : "As locações lançadas aparecerão aqui com status, datas e detalhes."}
          />
        ) : (
          <div className="rental-list">
            {result.rows.map((rental) => (
              <RentalRow
                key={rental.id}
                rental={rental}
                onArchiveToggle={() => void toggleArchiveRental(rental.id, Boolean(rental.archivedAt))}
                onOpen={() => void openDetail(rental.id)}
              />
            ))}
          </div>
        )}
        {hasMore && (
          <AppButton
            className="load-more"
            variant="ghost"
            icon={<RotateCcw size={17} />}
            type="button"
            onClick={() => void load({ ...appliedFilters, page: (appliedFilters.page ?? 1) + 1 }, true)}
          >Carregar mais</AppButton>
        )}
      </section>

      {selected && (
        <RentalDetailModal
          rental={selected}
          onArchiveToggle={() => void toggleArchiveRental(selected.id, Boolean(selected.archivedAt))}
          onClose={() => setSelected(null)}
          onFinalize={() => setFinalizeConfirm(true)}
        />
      )}
      {finalizeConfirm && selected && (
        <Modal
          title="Finalizar locação?"
          description={`O estoque de ${selected.code} será devolvido ao catálogo.`}
          onClose={() => setFinalizeConfirm(false)}
          footer={<>
            <AppButton type="button" variant="ghost" onClick={() => setFinalizeConfirm(false)}>Cancelar</AppButton>
            <AppButton type="button" variant="primary" icon={<CheckCircle2 size={18} />} onClick={() => void finalizeRental()}>Confirmar devolução</AppButton>
          </>}
        >
          <p className="confirm-copy">A locação será marcada como finalizada e não poderá ser finalizada novamente.</p>
        </Modal>
      )}
    </section>
  );
}

function RentalRow({
  rental,
  onArchiveToggle,
  onOpen,
}: {
  rental: RentalListItem;
  onArchiveToggle(): void;
  onOpen(): void;
}) {
  const ArchiveIcon = rental.archivedAt ? ArchiveRestore : Archive;
  const expirationAlert = getRentalExpirationAlert(rental);

  return (
    <article className="rental-row">
      <div className="rental-code"><ReceiptText size={18} /><div><span>Código</span><strong>{rental.code}</strong></div></div>
      <div className="rental-customer"><span>Locatário</span><strong>{rental.customerName}</strong></div>
      <StatusBadge kind={rental.status === "ONGOING" ? "warning" : "success"}>{rentalStatusLabels[rental.status]}</StatusBadge>
      {expirationAlert.state !== "none" && (
        <StatusBadge kind={expirationBadgeKind(expirationAlert.state)}>
          {expirationAlert.label}
        </StatusBadge>
      )}
      {rental.archivedAt && <StatusBadge kind="neutral">Arquivada</StatusBadge>}
      <div className="rental-dates"><CalendarDays size={17} /><span>{formatDate(rental.startDate)} <small>até</small> {formatDate(rental.returnDate)}</span></div>
      <div className="rental-items"><Package size={17} /><span>{rental.totalItems} item{rental.totalItems === 1 ? "" : "s"}</span></div>
      <AppButton variant="ghost" icon={<ArchiveIcon size={16} />} type="button" onClick={onArchiveToggle}>
        {rental.archivedAt ? "Desarquivar" : "Arquivar"}
      </AppButton>
      <AppButton variant="ghost" type="button" onClick={onOpen}>Ver detalhes <ChevronRight size={16} /></AppButton>
    </article>
  );
}

function expirationBadgeKind(
  state: Exclude<RentalExpirationState, "none">,
): "warning" | "danger" {
  return state === "warning" ? "warning" : "danger";
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
