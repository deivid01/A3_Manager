import { Archive, ArchiveRestore, CheckCircle2, FileDown, Printer } from "lucide-react";
import { useRef, useState } from "react";
import {
  getCustomerDisplayName,
  getCustomerIdentityFields,
} from "../../domain/customerDisplay";
import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  formatCents
} from "../../domain/money";
import type { RentalDetail } from "../../domain/types";
import { AppButton, Message, Modal, StatusBadge } from "../components/Form";

export function RentalDetailModal({ rental, onArchiveToggle, onClose, onFinalize }: {
  rental: RentalDetail;
  onArchiveToggle(): void;
  onClose(): void;
  onFinalize(): void;
}) {
  const [savingPdf, setSavingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const printingRef = useRef(false);
  const ArchiveIcon = rental.archivedAt ? ArchiveRestore : Archive;
  const totals = calculateRentalMoneyTotals(rental.items);
  const customerName = getCustomerDisplayName(rental.customerSnapshot);
  const customerIdentityFields = getCustomerIdentityFields(rental.customerSnapshot);
  const address = [rental.deliveryStreet, rental.deliveryNumber].filter(Boolean).join(", ");
  const addressLine = [address, rental.deliveryNeighborhood].filter(Boolean).join(" - ") || "Não informado";
  const cityLine = [rental.deliveryCity, rental.deliveryState].filter(Boolean).join(" / ");
  const cityAndCep = [cityLine, rental.deliveryCep].filter(Boolean).join(" · ") || "Não informado";

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
      await window.a3.printRental(rental.id, "report");
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
      wide
      className="rental-detail-modal"
      title={rental.code}
      description={customerName}
      onClose={onClose}
      footer={<>
        <AppButton variant="ghost" icon={<FileDown size={18} />} loading={savingPdf} type="button" onClick={() => void savePdf()}>Salvar em PDF</AppButton>
        <AppButton variant="secondary" icon={<Printer size={18} />} loading={printing} type="button" onClick={() => void printRental()}>Imprimir</AppButton>
        <AppButton variant="ghost" icon={<ArchiveIcon size={18} />} type="button" onClick={onArchiveToggle}>
          {rental.archivedAt ? "Desarquivar" : "Arquivar"}
        </AppButton>
        {rental.status === "ONGOING" && <AppButton variant="primary" icon={<CheckCircle2 size={18} />} type="button" onClick={onFinalize}>Finalizar locação</AppButton>}
      </>}
    >
      {error && <Message kind="error">{error}</Message>}
      {message && <Message kind="success">{message}</Message>}
      <div className="detail-overview">
        <div><span>Status</span><StatusBadge kind={rental.status === "ONGOING" ? "warning" : "success"}>{rentalStatusLabels[rental.status]}</StatusBadge></div>
        {rental.archivedAt && <div><span>Arquivo</span><StatusBadge kind="neutral">Arquivada</StatusBadge></div>}
        <div><span>Período</span><strong>{periodLabels[rental.period]}</strong></div>
        <div><span>Datas</span><strong>{formatDate(rental.startDate)} a {formatDate(rental.returnDate)}</strong></div>
        <div><span>Pagamento</span><strong>{paymentLabels[rental.paymentMethod]}{rental.installments ? ` em ${rental.installments}x` : ""}</strong></div>
      </div>
      <div className="detail-columns">
        <section>
          <h3>Locatário e entrega</h3>
          <dl className="detail-list">
            {customerIdentityFields.map((field) => (
              <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>
            ))}
            <div><dt>Contato</dt><dd>{rental.customerSnapshot.contact || "Não informado"}</dd></div>
            <div><dt>Endereço</dt><dd>{addressLine}</dd></div>
            <div><dt>Cidade</dt><dd>{cityAndCep}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Equipamentos</h3>
          <div className="detail-items">
            {rental.items.map((item) => (
              <div key={item.id}>
                <div><strong>{item.nameSnapshot}</strong><span>{item.quantity} unidade{item.quantity === 1 ? "" : "s"}</span></div>
                <RentalItemMoney item={item} />
              </div>
            ))}
          </div>
          <div className="detail-money-total">
            <div className="detail-total"><span>Total da locação</span><strong>{formatCents(totals.rentalTotalCents)}</strong></div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function RentalItemMoney({ item }: { item: RentalDetail["items"][number] }) {
  const totals = calculateRentalItemTotals(item);

  return (
    <dl className="detail-item-money">
      <div><dt>Valor unitário da locação</dt><dd>{formatCents(item.unitRentalRateCents)}</dd></div>
      <div><dt>Subtotal da locação</dt><dd>{formatCents(totals.itemSubtotalCents)}</dd></div>
      <div><dt>Indenização unitária</dt><dd>{formatCents(item.unitIndemnificationValueCents)}</dd></div>
    </dl>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
