import { Check, FileDown, PackagePlus, Plus, Printer, Search, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getCustomerDisplayName,
  getCustomerPrimaryDocument,
} from "../../domain/customerDisplay";
import { paymentLabels, periodLabels } from "../../domain/labels";
import { formatCents, type RentalMoneyTotals } from "../../domain/money";
import type { CustomerSearchResult, EquipmentSearchResult, RentalDetail } from "../../domain/types";
import type { RentalLaunchInput } from "../../shared/contracts";
import { AppButton, EmptyState, Message, Modal } from "../components/Form";
import { Separator } from "../components/ui/separator";

type RentalDraft = Omit<RentalLaunchInput, "customerId" | "items">;

export function RentalReview({
  customerName,
  form,
  itemLines,
  totalQuantity,
  totals,
  returnDate,
  error,
  launching,
  onLaunch,
}: {
  customerName?: string;
  form: RentalDraft;
  itemLines: number;
  totalQuantity: number;
  totals: RentalMoneyTotals;
  returnDate: string;
  error: string;
  launching: boolean;
  onLaunch(): void;
}) {
  return (
    <aside className="rental-review">
      <div className="review-header">
        <span>Revisão</span>
        <strong>Resumo da locação</strong>
      </div>
      <dl>
        <div><dt>Cliente</dt><dd>{customerName ?? "Não selecionado"}</dd></div>
        <div><dt>Equipamentos</dt><dd>{itemLines ? `${itemLines} linha${itemLines === 1 ? "" : "s"} · ${totalQuantity} unidade${totalQuantity === 1 ? "" : "s"}` : "Nenhum item"}</dd></div>
        <div><dt>Período</dt><dd>{periodLabels[form.period]}</dd></div>
        <div><dt>Devolução</dt><dd>{returnDate ? formatDate(returnDate) : "Não calculada"}</dd></div>
        <div><dt>Pagamento</dt><dd>{paymentLabels[form.paymentMethod]}{form.installments ? ` · ${form.installments}x` : ""}</dd></div>
      </dl>
      <Separator className="review-separator" />
      <div className="review-money">
        <div className="review-total"><span>Total da locação</span><strong>{formatCents(totals.rentalTotalCents)}</strong></div>
      </div>
      {error && <Message kind="error">{error}</Message>}
      <AppButton className="launch-button" variant="primary" icon={<Send size={18} />} loading={launching} type="button" onClick={onLaunch}>
        {launching ? "Lançando locação" : "Lançar locação"}
      </AppButton>
    </aside>
  );
}

export function RentalSuccessModal({ rental, onClose }: { rental: RentalDetail; onClose(): void }) {
  const [savingPdf, setSavingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const printingRef = useRef(false);

  async function savePdf() {
    setMessage("");
    setError("");
    setSavingPdf(true);
    try {
      const filePath = await window.a3.saveRentalPdf(rental.id);
      if (filePath) {
        setMessage("PDF salvo.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o PDF.",
      );
    } finally {
      setSavingPdf(false);
    }
  }

  async function printRental() {
    if (printingRef.current) {
      return;
    }
    printingRef.current = true;
    setMessage("");
    setError("");
    setPrinting(true);
    try {
      await window.a3.printRental(rental.id, "launch");
      setMessage("Documento enviado para impressão.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível imprimir a locação.",
      );
    } finally {
      printingRef.current = false;
      setPrinting(false);
    }
  }

  return (
    <Modal
      className="rental-success-modal"
      title="Locação lançada"
      description="A baixa de estoque foi concluída com sucesso."
      onClose={onClose}
      footer={<>
        <AppButton variant="ghost" icon={<FileDown size={18} />} loading={savingPdf} type="button" onClick={() => void savePdf()}>Salvar em PDF</AppButton>
        <AppButton variant="primary" icon={<Printer size={18} />} loading={printing} type="button" onClick={() => void printRental()}>Imprimir</AppButton>
      </>}
    >
      {error && <Message kind="error">{error}</Message>}
      {message && <Message kind="success">{message}</Message>}
      <div className="success-rental-code">
        <span><Check size={26} /></span>
        <div><small>Código da locação</small><strong>{rental.code}</strong></div>
      </div>
    </Modal>
  );
}

export function CustomerSearchModal({ onClose, onSelect }: { onClose(): void; onSelect(customer: CustomerSearchResult): void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const ready = search.trim().length >= 2 || search.replace(/\D/g, "").length >= 3;

  useEffect(() => {
    if (!ready) { setResults([]); setLoading(false); setCompleted(false); return; }
    let active = true;
    setResults([]);
    setLoading(true);
    setCompleted(false);
    const handle = window.setTimeout(() => {
      window.a3.searchCustomers(search)
        .then((rows) => {
          if (!active) return;
          setResults(rows);
          setCompleted(true);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setCompleted(true);
        })
        .finally(() => active && setLoading(false));
    }, 250);
    return () => { active = false; window.clearTimeout(handle); };
  }, [search, ready]);

  return (
    <Modal className="customer-search-modal" title="Selecionar cliente" description="Busque pelo nome, CPF ou CNPJ. Nenhum dado é exibido antes da pesquisa." onClose={onClose}>
      <SearchInput value={search} onChange={setSearch} placeholder="Digite nome, CPF ou CNPJ" />
      {!ready ? <EmptyState icon={<Search size={24} />} title="Comece a buscar" description="Digite ao menos 2 letras ou 3 números." />
        : loading ? <Loading label="Buscando clientes" />
        : completed && results.length === 0 ? <EmptyState title="Nenhum cliente encontrado" description="Revise o termo informado e tente novamente." />
        : <div className="search-results">{results.map((customer) => (
          <CustomerSearchResultButton
            customer={customer}
            key={customer.id}
            onSelect={() => onSelect(customer)}
          />
        ))}</div>}
    </Modal>
  );
}

function CustomerSearchResultButton({
  customer,
  onSelect,
}: {
  customer: CustomerSearchResult;
  onSelect(): void;
}) {
  const document = getCustomerPrimaryDocument(customer);
  const documentText = document.value
    ? `${document.label} ${document.value}`
    : "Sem documento";

  return (
    <button type="button" onClick={onSelect}>
      <span className="result-icon"><UserRound size={18} /></span>
      <div>
        <strong>{getCustomerDisplayName(customer)}</strong>
        <span>{documentText} · {customer.city || "Sem cidade"}</span>
      </div>
      <Check size={17} />
    </button>
  );
}

export function EquipmentSearchModal({ selectedIds, onClose, onSelect }: { selectedIds: string[]; onClose(): void; onSelect(equipment: EquipmentSearchResult): void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EquipmentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const ready = search.trim().length >= 2;

  useEffect(() => {
    if (!ready) { setResults([]); setLoading(false); setCompleted(false); return; }
    let active = true;
    setResults([]);
    setLoading(true);
    setCompleted(false);
    const handle = window.setTimeout(() => {
      window.a3.searchEquipment(search)
        .then((rows) => {
          if (!active) return;
          setResults(rows);
          setCompleted(true);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setCompleted(true);
        })
        .finally(() => active && setLoading(false));
    }, 250);
    return () => { active = false; window.clearTimeout(handle); };
  }, [search, ready]);

  return (
    <Modal className="equipment-search-modal" title="Selecionar equipamento" description="Consulte o catálogo e veja o estoque disponível." onClose={onClose}>
      <SearchInput value={search} onChange={setSearch} placeholder="Digite o nome do equipamento" />
      {!ready ? <EmptyState icon={<Search size={24} />} title="Comece a buscar" description="Digite ao menos 2 letras." />
        : loading ? <Loading label="Buscando equipamentos" />
        : completed && results.length === 0 ? <EmptyState title="Nenhum equipamento encontrado" description="Revise o termo informado e tente novamente." />
        : <div className="search-results">{results.map((equipment) => {
          const selected = selectedIds.includes(equipment.id);
          return (
            <button disabled={equipment.stockQuantity <= 0 || selected} key={equipment.id} type="button" onClick={() => onSelect(equipment)}>
              <span className="result-icon"><PackagePlus size={18} /></span>
              <div><strong>{equipment.name}</strong><span>{selected ? "Já adicionado" : `${equipment.stockQuantity} ${equipment.stockQuantity === 1 ? "disponível" : "disponíveis"}`}</span></div>
              <Plus size={17} />
            </button>
          );
        })}</div>}
    </Modal>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder: string }) {
  return <label className="modal-search"><Search size={18} /><input autoFocus value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Loading({ label }: { label: string }) {
  return <div className="loading-state"><span className="loading-spinner" />{label}</div>;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
