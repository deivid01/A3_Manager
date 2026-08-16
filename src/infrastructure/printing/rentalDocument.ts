import { paymentLabels, periodLabels, rentalStatusLabels } from "../../domain/labels";
import {
  calculateRentalItemTotals,
  calculateRentalMoneyTotals,
  formatCents
} from "../../domain/money";
import type { RentalDetail } from "../../domain/types";
import type { RentalPrintLayoutMode } from "./printLayoutStrategy";
import { RESPONSIBILITY_TERM_TEXT } from "./responsibilityTerm";

export function renderRentalDocumentHtml(
  rental: RentalDetail,
  layoutMode: RentalPrintLayoutMode = "NORMAL",
): string {
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
          :root {
            --page-margin: 12mm;
            --body-font-size: 12px;
            --body-line-height: 1.42;
            --section-gap: 16px;
            --table-padding: 4.5px;
            --signature-gap: 34px;
          }
          body.print-COMPACT {
            --page-margin: 10mm;
            --body-font-size: 11.3px;
            --body-line-height: 1.34;
            --section-gap: 12px;
            --table-padding: 3.5px;
            --signature-gap: 26px;
          }
          @page { size: A4; margin: var(--page-margin); }
          body {
            color: #1c1c1c;
            font-family: Arial, Helvetica, sans-serif;
            font-size: var(--body-font-size);
            line-height: var(--body-line-height);
            margin: 0;
            padding-bottom: 18px;
          }
          main { padding: 0; }
          header {
            border-bottom: 2px solid #f2a51a;
            display: flex;
            gap: 20px;
            justify-content: space-between;
            padding-bottom: 12px;
          }
          h1, h2 { margin: 0; }
          h1 { font-size: 18px; text-transform: uppercase; }
          h2 {
            border-bottom: 1px solid #d8d8d8;
            font-size: 13px;
            margin-top: var(--section-gap);
            padding-bottom: 4px;
            text-transform: uppercase;
          }
          table { border-collapse: collapse; margin-top: 8px; width: 100%; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th, td { border: 1px solid #d7d7d7; padding: var(--table-padding); text-align: left; }
          th { background: #f5f5f5; }
          tfoot th { background: #fbfaf4; }
          .grand-total th { background: #fff0c2; font-size: 13px; }
          .numeric { text-align: right; white-space: nowrap; }
          .grid { display: grid; gap: 5px 18px; grid-template-columns: repeat(2, 1fr); margin-top: 7px; }
          .muted { color: #555; font-size: 10px; }
          .term-block { break-inside: avoid; page-break-inside: avoid; }
          .term { margin: 10px 0 0; text-align: justify; }
          .signature-date { margin-top: 18px; }
          .signature {
            break-inside: avoid;
            display: grid;
            gap: var(--signature-gap);
            grid-template-columns: 1fr 1fr;
            margin-top: var(--signature-gap);
            page-break-inside: avoid;
          }
          .line { border-top: 1px solid #222; padding-top: 6px; text-align: center; }
          .print-footer {
            border-top: 1px solid #d8d8d8;
            bottom: 0;
            color: #666;
            font-size: 9px;
            left: 0;
            padding-top: 4px;
            position: fixed;
            right: 0;
            text-align: right;
          }
        </style>
      </head>
      <body class="print-${layoutMode}">
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

          <section class="term-block">
            <h2>TERMO DE RESPONSABILIDADE</h2>
            <p class="term">${escapeHtml(RESPONSIBILITY_TERM_TEXT)}</p>

            <div class="signature-date">
              Local e data: ________________________________________________
            </div>
            <div class="signature">
              <div class="line">Assinatura da A3 Locação</div>
              <div class="line">Assinatura do locatário ou recebedor</div>
            </div>
            <p class="muted">Documento gerado pelo A3 Manager.</p>
          </section>
          <div class="print-footer">Locação ${escapeHtml(rental.code)} · A3 Manager</div>
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
