import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  formatCents
} from "../../domain/money";
import type { RentalDetail } from "../../domain/types";

export function renderRentalDocumentHtml(rental: RentalDetail): string {
  const company = rental.companySnapshot;
  const customer = rental.customerSnapshot;
  const rows = rental.items
    .map((item) => {
      const totals = calculateRentalItemTotals(item);
      return `
        <tr>
          <td class="numeric">${item.quantity}</td>
          <td>${escapeHtml(item.nameSnapshot)}</td>
          <td class="numeric">${formatCents(item.equipmentValueCents)}</td>
          <td class="numeric">${formatCents(totals.equipmentSubtotalCents)}</td>
          <td class="numeric">${formatCents(item.unitIndemnificationValueCents)}</td>
          <td class="numeric">${formatCents(totals.indemnificationSubtotalCents)}</td>
          <td class="numeric">${formatCents(totals.totalCents)}</td>
        </tr>
      `;
    })
    .join("");
  const totals = calculateRentalMoneyTotals(rental.items);

  return `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Locação ${escapeHtml(rental.code)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            color: #1c1c1c;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.45;
          }
          @page { size: A4; margin: 12mm; }
          main { padding: 24px 28px; }
          header {
            border-bottom: 2px solid #f2a51a;
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding-bottom: 14px;
          }
          h1, h2 { margin: 0; }
          h1 { font-size: 19px; text-transform: uppercase; }
          h2 {
            border-bottom: 1px solid #d8d8d8;
            font-size: 14px;
            margin-top: 18px;
            padding-bottom: 4px;
            text-transform: uppercase;
          }
          table { border-collapse: collapse; margin-top: 8px; width: 100%; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th, td { border: 1px solid #d7d7d7; padding: 5px; text-align: left; }
          th { background: #f5f5f5; }
          tfoot th { background: #fbfaf4; }
          .grand-total th { background: #fff0c2; font-size: 13px; }
          .numeric { text-align: right; white-space: nowrap; }
          .grid { display: grid; gap: 6px 20px; grid-template-columns: repeat(2, 1fr); margin-top: 8px; }
          .muted { color: #555; }
          .term { margin-top: 18px; text-align: justify; }
          .signature {
            break-inside: avoid;
            display: grid;
            gap: 28px;
            grid-template-columns: 1fr 1fr;
            margin-top: 42px;
            page-break-inside: avoid;
          }
          .line { border-top: 1px solid #222; padding-top: 6px; text-align: center; }
        </style>
      </head>
      <body>
        <main>
          <header>
            <section>
              <h1>${escapeHtml(company.tradeName)}</h1>
              <div>${escapeHtml(company.legalName)}</div>
              <div>${escapeHtml(company.document)}</div>
              <div>${escapeHtml(company.street)}, ${escapeHtml(company.number)} - ${escapeHtml(company.neighborhood)}</div>
              <div>${escapeHtml(company.city)} - ${escapeHtml(company.state)} | ${escapeHtml(company.contact)}</div>
            </section>
            <section>
              <strong>Contrato de locação</strong><br />
              Código: ${escapeHtml(rental.code)}<br />
              Status: ${rentalStatusLabels[rental.status]}<br />
              Emitido por: ${escapeHtml(rental.launchedByUsername)}
            </section>
          </header>

          <h2>Locatário</h2>
          <div class="grid">
            <div><strong>Nome:</strong> ${escapeHtml(customer.name)}</div>
            <div><strong>CPF:</strong> ${escapeHtml(customer.cpf)}</div>
            <div><strong>RG:</strong> ${escapeHtml(customer.rg || "Não informado")}</div>
            <div><strong>Contato:</strong> ${escapeHtml(customer.contact)}</div>
            <div><strong>Endereço:</strong> ${escapeHtml(customer.street)}, ${escapeHtml(customer.number)} - ${escapeHtml(customer.neighborhood)}</div>
            <div><strong>Cidade/UF:</strong> ${escapeHtml(customer.city)} - ${escapeHtml(customer.state)}</div>
          </div>

          <h2>Locação</h2>
          <div class="grid">
            <div><strong>Período:</strong> ${periodLabels[rental.period]}</div>
            <div><strong>Data de início:</strong> ${formatDate(rental.startDate)}</div>
            <div><strong>Data de devolução:</strong> ${formatDate(rental.returnDate)}</div>
            <div><strong>Pagamento:</strong> ${paymentLabels[rental.paymentMethod]}${rental.installments ? ` em ${rental.installments} parcela(s)` : ""}</div>
          </div>

          <h2>Entrega e recebimento</h2>
          <div class="grid">
            <div><strong>Endereço de entrega:</strong> ${formatDelivery(rental)}</div>
            <div><strong>Responsável pelo recebimento:</strong> ${receiverText(rental)}</div>
          </div>

          <h2>Equipamentos</h2>
          <table>
            <thead>
              <tr>
                <th class="numeric">Qtd.</th>
                <th>Equipamento</th>
                <th class="numeric">Valor unitário do equipamento</th>
                <th class="numeric">Subtotal do equipamento</th>
                <th class="numeric">Indenização unitária</th>
                <th class="numeric">Subtotal da indenização</th>
                <th class="numeric">Total do item</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <th colspan="6" class="numeric">Valor total dos equipamentos</th>
                <th class="numeric">${formatCents(totals.equipmentTotalCents)}</th>
              </tr>
              <tr>
                <th colspan="6" class="numeric">Valor total da indenização</th>
                <th class="numeric">${formatCents(totals.indemnificationTotalCents)}</th>
              </tr>
              <tr class="grand-total">
                <th colspan="6" class="numeric">TOTAL</th>
                <th class="numeric">${formatCents(totals.grandTotalCents)}</th>
              </tr>
            </tfoot>
          </table>

          <h2>Termo de responsabilidade</h2>
          <p class="term">
            O locatário declara que recebeu os equipamentos acima em condições de uso, responsabilizando-se
            pela guarda, conservação, devolução no prazo acordado e indenização por perda, dano, extravio ou
            uso inadequado, conforme os valores registrados neste documento.
          </p>

          <div class="signature">
            <div class="line">Assinatura da A3 Locação</div>
            <div class="line">Assinatura do locatário ou recebedor</div>
          </div>
          <p class="muted">Documento gerado pelo A3 Manager.</p>
        </main>
      </body>
    </html>`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDelivery(rental: RentalDetail): string {
  const parts = [
    rental.deliveryStreet,
    rental.deliveryNumber,
    rental.deliveryNeighborhood,
    rental.deliveryCep,
    rental.deliveryCity,
    rental.deliveryState
  ].filter(Boolean);
  return escapeHtml(parts.length ? parts.join(", ") : "Não informado");
}

function receiverText(rental: RentalDetail): string {
  if (rental.receiverIsCustomer) {
    return "O próprio locatário";
  }
  return `${escapeHtml(rental.receiverName)} - CPF ${escapeHtml(rental.receiverCpf)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
