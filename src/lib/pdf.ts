import { invoiceTotals, lineTotal } from './invoice';
import { formatMoney } from './money';
import type { Business, Client, Invoice } from './types';

const esc = (s: string | undefined | null) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const nl2br = (s: string | undefined) => esc(s).replace(/\n/g, '<br/>');

export function invoiceHtml(inv: Invoice, business: Business, client: Client | undefined): string {
  const money = (n: number) => formatMoney(n, inv.currency);
  const t = invoiceTotals(inv);
  const rows = inv.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(lineTotal(l))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 40px; font-size: 12px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.5px; }
  .muted { color: #666; }
  .row { display: flex; justify-content: space-between; margin-top: 28px; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  th { text-align: left; border-bottom: 2px solid #111; padding: 8px 4px; font-size: 11px; text-transform: uppercase; }
  td { border-bottom: 1px solid #eee; padding: 10px 4px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 260px; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: 700; font-size: 16px; border-top: 2px solid #111; padding-top: 8px !important; }
  .foot { margin-top: 40px; font-size: 11px; }
</style></head>
<body>
  <div class="row" style="margin-top:0">
    <div>
      <h1>Invoice</h1>
      <div class="muted">${inv.number ? esc(inv.number) : 'DRAFT'}</div>
    </div>
    <div style="text-align:right">
      <strong>${esc(business.name)}</strong><br/>
      ${nl2br(business.address)}<br/>
      ${esc(business.email)}
      ${business.vatNumber ? `<br/>VAT: ${esc(business.vatNumber)}` : ''}
    </div>
  </div>
  <div class="row">
    <div>
      <div class="muted">Billed to</div>
      <strong>${esc(client?.name ?? '')}</strong><br/>
      ${nl2br(client?.address)}${client?.email ? `<br/>${esc(client.email)}` : ''}
    </div>
    <div style="text-align:right">
      ${inv.issueDate ? `<div><span class="muted">Issue date</span> ${esc(inv.issueDate)}</div>` : ''}
      ${inv.dueDate ? `<div><span class="muted">Due date</span> ${esc(inv.dueDate)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div><span>Discount (${inv.discountPercent}%)</span><span>-${money(t.discount)}</span></div>` : ''}
    ${inv.vatRate ? `<div><span>VAT (${inv.vatRate}%)</span><span>${money(t.vat)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${money(t.total)}</span></div>
  </div>
  <div class="foot">
    ${business.legalNote ? `<p>${esc(business.legalNote)}</p>` : ''}
    ${business.paymentDetails ? `<p><strong>Payment</strong><br/>${nl2br(business.paymentDetails)}</p>` : ''}
    ${inv.notes ? `<p>${nl2br(inv.notes)}</p>` : ''}
  </div>
</body></html>`;
}
