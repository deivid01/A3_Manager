import { CheckCircle2, FileDown, Printer } from "lucide-react";
import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  formatCents
} from "../../domain/money";
import type { RentalDetail } from "../../domain/types";
import { AppButton, Modal, StatusBadge } from "../components/Form";

export function RentalDetailModal({ rental, onClose, onFinalize }: {
  rental: RentalDetail;
  onClose(): void;
  onFinalize(): void;
}) {
  const totals = calculateRentalMoneyTotals(rental.items);
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
                <RentalItemMoney item={item} />
              </div>
            ))}
          </div>
          <div className="detail-money-total">
            <div><span>Valor dos equipamentos</span><strong>{formatCents(totals.equipmentTotalCents)}</strong></div>
            <div><span>Indenização</span><strong>{formatCents(totals.indemnificationTotalCents)}</strong></div>
            <div className="detail-total"><span>Total</span><strong>{formatCents(totals.grandTotalCents)}</strong></div>
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
      <div><dt>Valor unitário do equipamento</dt><dd>{formatCents(item.equipmentValueCents)}</dd></div>
      <div><dt>Subtotal do equipamento</dt><dd>{formatCents(totals.equipmentSubtotalCents)}</dd></div>
      <div><dt>Indenização unitária</dt><dd>{formatCents(item.unitIndemnificationValueCents)}</dd></div>
      <div><dt>Subtotal da indenização</dt><dd>{formatCents(totals.indemnificationSubtotalCents)}</dd></div>
      <div><dt>Total do item</dt><dd>{formatCents(totals.totalCents)}</dd></div>
    </dl>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
