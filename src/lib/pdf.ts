import { invoiceTotals, lineTotal } from './invoice';
import { formatMoney } from './money';
import type { Business, Client, Invoice, Language } from './types';

const esc = (s: string | undefined | null) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const nl2br = (s: string | undefined) => esc(s).replace(/\n/g, '<br/>');

const LABELS: Record<Language, Record<string, string>> = {
  fr: {
    invoice: 'Facture',
    draft: 'BROUILLON',
    billedTo: 'Facturé à',
    issueDate: 'Date d’émission',
    dueDate: 'Échéance',
    description: 'Désignation',
    qty: 'Qté',
    unitPrice: 'Prix unitaire',
    amount: 'Montant',
    subtotal: 'Sous-total',
    discount: 'Remise',
    vat: 'TVA',
    total: 'Total',
    payment: 'Paiement',
    siren: 'SIREN',
    vatNumber: 'N° TVA',
    lateFees:
      'En cas de retard de paiement : pénalités au taux de 3 fois le taux d’intérêt légal et indemnité forfaitaire de 40 € pour frais de recouvrement.',
  },
  en: {
    invoice: 'Invoice',
    draft: 'DRAFT',
    billedTo: 'Billed to',
    issueDate: 'Issue date',
    dueDate: 'Due date',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    vat: 'VAT',
    total: 'Total',
    payment: 'Payment',
    siren: 'Company no.',
    vatNumber: 'VAT no.',
    lateFees: '',
  },
};

const safeColor = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : '#1F6F4A');
const safeLogo = (uri?: string) => (uri && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : '');

/** Invoice as standalone HTML, rendered to PDF by expo-print. Three layouts share the same content. */
export function invoiceHtml(inv: Invoice, business: Business, client: Client | undefined): string {
  const lang: Language = business.invoiceLanguage ?? 'fr';
  const L = LABELS[lang];
  const locale = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const money = (n: number) => formatMoney(n, inv.currency, locale);
  const t = invoiceTotals(inv);
  const accent = safeColor(business.accentColor);
  const logo = safeLogo(business.logoDataUri);
  const template = business.template ?? 'classic';
  const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString(locale, { timeZone: 'UTC' }) : '');

  const rows = inv.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.description)}</td>
        <td class="num">${String(l.quantity).replace('.', lang === 'fr' ? ',' : '.')}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(lineTotal(l))}</td>
      </tr>`,
    )
    .join('');

  const seller = `
    ${logo ? `<img class="logo" src="${logo}" alt=""/>` : ''}
    <strong>${esc(business.name)}</strong>${business.legalForm ? ` · ${esc(business.legalForm)}` : ''}<br/>
    ${nl2br(business.address)}${business.email ? `<br/>${esc(business.email)}` : ''}
    ${business.siren ? `<br/>${L.siren} ${esc(business.siren)}` : ''}
    ${business.vatNumber ? `<br/>${L.vatNumber} ${esc(business.vatNumber)}` : ''}`;

  const buyer = `
    <div class="muted">${L.billedTo}</div>
    <strong>${esc(client?.name ?? '')}</strong><br/>
    ${nl2br(client?.address)}${client?.email ? `<br/>${esc(client.email)}` : ''}
    ${client?.siren ? `<br/>${L.siren} ${esc(client.siren)}` : ''}
    ${client?.vatNumber ? `<br/>${L.vatNumber} ${esc(client.vatNumber)}` : ''}`;

  const meta = `
    <div class="number">${inv.number ? esc(inv.number) : L.draft}</div>
    ${inv.issueDate ? `<div><span class="muted">${L.issueDate}</span> ${fmtDate(inv.issueDate)}</div>` : ''}
    ${inv.dueDate ? `<div><span class="muted">${L.dueDate}</span> ${fmtDate(inv.dueDate)}</div>` : ''}`;

  const header =
    template === 'bold'
      ? `<div class="band"><div><h1>${L.invoice}</h1>${meta}</div><div class="right">${seller}</div></div>
         <div class="row">${'<div>' + buyer + '</div>'}</div>`
      : template === 'minimal'
        ? `<div class="row top"><div>${seller}</div><div class="right"><h1>${L.invoice}</h1>${meta}</div></div>
           <div class="row">${'<div>' + buyer + '</div>'}</div>`
        : `<div class="row top"><div><h1>${L.invoice}</h1>${meta}</div><div class="right">${seller}</div></div>
           <div class="row"><div>${buyer}</div></div>`;

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"/>
<style>
  :root { --accent: ${accent}; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 40px; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.5px; }
  .muted { color: #666; }
  .number { font-weight: 700; margin-bottom: 4px; }
  .row { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
  .row.top { margin-top: 0; }
  .right { text-align: right; }
  .logo { max-height: 56px; max-width: 180px; display: block; margin: 0 0 8px auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; }
  th { text-align: left; padding: 8px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
  td { border-bottom: 1px solid #eee; padding: 10px 6px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 280px; margin-top: 16px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: 700; font-size: 16px; padding-top: 8px !important; }
  .foot { margin-top: 40px; font-size: 11px; color: #333; }
  /* classic */
  .t-classic th { border-bottom: 2px solid var(--accent); }
  .t-classic h1 { color: var(--accent); }
  .t-classic .grand { border-top: 2px solid var(--accent); }
  /* minimal */
  .t-minimal h1 { font-weight: 300; font-size: 32px; }
  .t-minimal th { border-bottom: 1px solid #111; font-weight: 500; color: #555; }
  .t-minimal .grand { border-top: 1px solid #111; }
  .t-minimal .number { color: var(--accent); }
  /* bold */
  .t-bold { padding: 0; }
  .t-bold .band { background: var(--accent); color: #fff; padding: 36px 40px; display: flex; justify-content: space-between; gap: 24px; }
  .t-bold .band .muted { color: rgba(255,255,255,.75); }
  .t-bold .band .logo { background: #fff; padding: 6px; border-radius: 6px; }
  .t-bold .row, .t-bold table, .t-bold .totals, .t-bold .foot { margin-left: 40px; margin-right: 40px; }
  .t-bold table { width: calc(100% - 80px); }
  .t-bold th { background: #f3f3f3; }
  .t-bold .grand { background: var(--accent); color: #fff; padding: 10px 8px !important; border-radius: 6px; }
</style></head>
<body class="t-${template}">
  ${header}
  <table>
    <thead><tr><th>${L.description}</th><th class="num">${L.qty}</th><th class="num">${L.unitPrice}</th><th class="num">${L.amount}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>${L.subtotal}</span><span>${money(t.subtotal)}</span></div>
    ${t.discount ? `<div><span>${L.discount} (${inv.discountPercent} %)</span><span>-${money(t.discount)}</span></div>` : ''}
    ${inv.vatRate ? `<div><span>${L.vat} (${inv.vatRate} %)</span><span>${money(t.vat)}</span></div>` : ''}
    <div class="grand"><span>${L.total}</span><span>${money(t.total)}</span></div>
  </div>
  <div class="foot">
    ${business.legalNote ? `<p>${esc(business.legalNote)}</p>` : ''}
    ${business.paymentDetails ? `<p><strong>${L.payment}</strong><br/>${nl2br(business.paymentDetails)}</p>` : ''}
    ${L.lateFees && business.country === 'FR' ? `<p class="muted">${L.lateFees}</p>` : ''}
    ${inv.notes ? `<p>${nl2br(inv.notes)}</p>` : ''}
  </div>
</body></html>`;
}
