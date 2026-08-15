import { CheckCircle2, FileDown, Printer } from "lucide-react";
import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import { formatCents } from "../../domain/money";
import type { RentalDetail } from "../../domain/types";
import { AppButton, Modal, StatusBadge } from "../components/Form";

export function RentalDetailModal({ rental, onClose, onFinalize }: {
  rental: RentalDetail;
  onClose(): void;
  onFinalize(): void;
}) {
  const total = rental.items.reduce(
    (sum, item) => sum + item.quantity * item.unitIndemnificationValueCents,
    0,
  );
  const address = [rental.deliveryStreet, rental.deliveryNumber].filter(Boolean).join(", ");
  const addressLine = [address, rental.deliveryNeighborhood].filter(Boolean).join(" - ") || "Não informado";
  const cityLine = [rental.deliveryCity, rental.deliveryState].filter(Boolean).join(" / ");
  const cityAndCep = [cityLine, rental.deliveryCep].filter(Boolean).join(" · ") || "Não informado";

  return (
    <Modal
      wide
      className="rental-detail-modal"
      title={rental.code}
      description={rental.customerSnapshot.name}
      onClose={onClose}
      footer={<>
        <AppButton variant="ghost" icon={<FileDown size={18} />} type="button" onClick={() => window.a3.saveRentalPdf(rental.id)}>Salvar em PDF</AppButton>
        <AppButton variant="secondary" icon={<Printer size={18} />} type="button" onClick={() => window.a3.printRental(rental.id)}>Imprimir</AppButton>
        {rental.status === "ONGOING" && <AppButton variant="primary" icon={<CheckCircle2 size={18} />} type="button" onClick={onFinalize}>Finalizar locação</AppButton>}
      </>}
    >
      <div className="detail-overview">
        <div><span>Status</span><StatusBadge kind={rental.status === "ONGOING" ? "warning" : "success"}>{rentalStatusLabels[rental.status]}</StatusBadge></div>
        <div><span>Período</span><strong>{periodLabels[rental.period]}</strong></div>
        <div><span>Datas</span><strong>{formatDate(rental.startDate)} a {formatDate(rental.returnDate)}</strong></div>
        <div><span>Pagamento</span><strong>{paymentLabels[rental.paymentMethod]}{rental.installments ? ` em ${rental.installments}x` : ""}</strong></div>
      </div>
      <div className="detail-columns">
        <section>
          <h3>Entrega e recebimento</h3>
          <dl className="detail-list">
            <div><dt>Endereço</dt><dd>{addressLine}</dd></div>
            <div><dt>Cidade</dt><dd>{cityAndCep}</dd></div>
            <div><dt>Recebedor</dt><dd>{rental.receiverIsCustomer ? "O próprio locatário" : `${rental.receiverName} · ${rental.receiverCpf}`}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Equipamentos</h3>
          <div className="detail-items">
            {rental.items.map((item) => (
              <div key={item.id}>
                <div><strong>{item.nameSnapshot}</strong><span>{item.quantity} unidade{item.quantity === 1 ? "" : "s"}</span></div>
                <strong>{formatCents(item.quantity * item.unitIndemnificationValueCents)}</strong>
              </div>
            ))}
          </div>
          <div className="detail-total"><span>Indenização total</span><strong>{formatCents(total)}</strong></div>
        </section>
      </div>
    </Modal>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
