import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { periodLabel } from "./billing";

const INK = rgb(0.11, 0.15, 0.15);
const MUTED = rgb(0.37, 0.42, 0.42);
const BRAND = rgb(0.06, 0.24, 0.24);
const LINE = rgb(0.85, 0.88, 0.88);
const SHADE = rgb(0.95, 0.96, 0.96);

// Standard PDF fonts only cover Windows-1252; swap anything else for a safe equivalent.
function safe(s) {
  return String(s ?? "")
    .replace(/[   ]/g, " ")
    .replace(/→/g, "to")
    .replace(/[^\x20-\x7e¡-ÿ–—‘’“”•€\n]/g, "?");
}
export const rand = (n) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (v < 0 ? "-R" : "R") + s;
};
const dateZA = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]} ${y}`;
};

export async function invoicePdf(inv, billing) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, M = 48;
  let y = 841.89 - M;

  const text = (s, x, yy, { f = font, size = 9.5, color = INK, align = "left" } = {}) => {
    const t = safe(s);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: align === "right" ? x - w : x, y: yy, size, font: f, color });
  };
  const wrap = (s, maxW, f = font, size = 9.5) => {
    const out = [];
    for (const para of safe(s).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const tryLine = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(tryLine, size) > maxW && line) { out.push(line); line = word; } else line = tryLine;
      }
      out.push(line);
    }
    return out;
  };

  const isCredit = inv.kind === "credit";
  const title = isCredit ? (inv.vat_registered ? "TAX CREDIT NOTE" : "CREDIT NOTE") : inv.vat_registered ? "TAX INVOICE" : "INVOICE";

  // Header
  text(billing.company_name, M, y, { f: bold, size: 15, color: BRAND });
  text(title, W - M, y, { f: bold, size: 15, color: BRAND, align: "right" });
  y -= 16;
  const left = [...safe(billing.address).split("\n"), `Reg. no. ${billing.reg_no}`];
  if (inv.vat_registered && billing.vat_number) left.push(`VAT no. ${billing.vat_number}`);
  if (billing.email) left.push(billing.email);
  if (billing.phone) left.push(billing.phone);
  const right = [
    [isCredit ? "Credit note no." : "Invoice no.", inv.number || "DRAFT"],
    ["Date", dateZA(inv.issue_date)],
    ...(isCredit ? [["Credits invoice", inv.credit_of_number || ""]] : [["Due date", dateZA(inv.due_date)]]),
    ["Period", periodLabel(inv.period)],
  ];
  let ly = y, ry = y;
  for (const l of left) { text(l, M, ly, { color: MUTED }); ly -= 12; }
  for (const [k, v] of right) {
    text(k, W - M - 150, ry, { color: MUTED });
    text(v, W - M, ry, { f: bold, align: "right" });
    ry -= 13;
  }
  y = Math.min(ly, ry) - 14;

  // Bill to
  page.drawRectangle({ x: M, y: y - 70, width: W - 2 * M, height: 78, color: SHADE });
  text("BILL TO", M + 10, y - 6, { f: bold, size: 8, color: MUTED });
  let by = y - 20;
  const billTo = [inv.legal_name || inv.trading_name];
  if (inv.legal_name && inv.trading_name && inv.legal_name !== inv.trading_name && !inv.legal_name.includes(inv.trading_name)) billTo.push(`t/a ${inv.trading_name}`);
  if (inv.tenant_reg_no) billTo.push(/^ID/i.test(inv.tenant_reg_no) ? inv.tenant_reg_no : `Reg. no. ${inv.tenant_reg_no}`);
  if (inv.vat_registered && inv.tenant_vat_no) billTo.push(`VAT no. ${inv.tenant_vat_no}`);
  billTo.forEach((l, i) => { text(l, M + 10, by, { f: i === 0 ? bold : font }); by -= 12; });
  let py = y - 20;
  text("Premises", W / 2 + 10, py, { color: MUTED });
  text(`${inv.unit_name || ""}, Westfleur Centre`, W / 2 + 70, py, { f: bold });
  py -= 12;
  if (inv.postal_address) for (const l of wrap(inv.postal_address, W / 2 - M - 80).slice(0, 3)) { text(l, W / 2 + 70, py, { color: MUTED }); py -= 12; }
  y -= 92;

  // Lines
  const cols = { desc: M + 8, qty: W - M - 205, price: W - M - 95, amount: W - M - 8 };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: BRAND });
  text("Description", cols.desc, y, { f: bold, color: rgb(1, 1, 1) });
  text("Qty", cols.qty, y, { f: bold, color: rgb(1, 1, 1), align: "right" });
  text("Unit price", cols.price, y, { f: bold, color: rgb(1, 1, 1), align: "right" });
  text("Amount", cols.amount, y, { f: bold, color: rgb(1, 1, 1), align: "right" });
  y -= 22;
  for (const l of inv.lines) {
    const rows = wrap(l.description, cols.qty - cols.desc - 70);
    rows.forEach((r, i) => text(r, cols.desc, y - i * 12));
    if (l.quantity !== null && l.quantity !== undefined) {
      const q = Number(l.quantity);
      text(`${Number.isInteger(q) ? q : q.toFixed(3)}${l.unit && l.unit !== "month" ? " " + l.unit : ""}`, cols.qty, y, { align: "right" });
    }
    if (l.unit_price !== null && l.unit_price !== undefined) text(rand(l.unit_price), cols.price, y, { align: "right" });
    text(rand(l.amount), cols.amount, y, { align: "right" });
    y -= 12 * rows.length + 6;
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: LINE });
  }

  // Totals
  y -= 6;
  const tot = (k, v, strong) => {
    text(k, cols.price, y, { f: strong ? bold : font, align: "right", color: strong ? INK : MUTED });
    text(v, cols.amount, y, { f: strong ? bold : font, align: "right", size: strong ? 11 : 9.5 });
    y -= strong ? 16 : 13;
  };
  tot("Subtotal", rand(inv.subtotal));
  if (inv.vat_registered) tot(`VAT @ ${Math.round((billing.vat_rate || 0.15) * 100)}%`, rand(inv.vat));
  tot(isCredit ? "Total credit" : "Total", rand(inv.total), true);

  // Statement
  if (inv.statement) {
    y -= 8;
    page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 54, borderColor: LINE, borderWidth: 1 });
    text("STATEMENT OF ACCOUNT", M + 10, y - 2, { f: bold, size: 8, color: MUTED });
    const s = inv.statement;
    const items = [["Balance brought forward", rand(s.opening)], [isCredit ? "This credit note" : "This invoice", rand(inv.total)], ["Amount due", rand(s.due)]];
    items.forEach(([k, v], i) => {
      const x = M + 10 + i * ((W - 2 * M - 20) / 3);
      text(k, x, y - 20, { color: MUTED });
      text(v, x, y - 34, { f: bold, size: i === 2 ? 12 : 10 });
    });
    y -= 64;
  }

  // Payment details
  if (!isCredit) {
    text("PAYMENT DETAILS", M, y, { f: bold, size: 8, color: MUTED });
    y -= 13;
    const pay = [
      ["Bank", billing.bank_name], ["Account name", billing.account_name], ["Account no.", billing.account_no],
      ["Branch code", billing.branch_code], ["Reference", inv.number || "use the invoice number"],
    ];
    for (const [k, v] of pay) { text(k, M, y, { color: MUTED }); text(v, M + 80, y, { f: k === "Reference" ? bold : font }); y -= 12; }
    y -= 6;
  }
  if (inv.notes) { for (const l of wrap(inv.notes, W - 2 * M)) { text(l, M, y); y -= 12; } y -= 4; }

  // Footer
  let fy = M + 20;
  const foot = [];
  if (billing.footer && !isCredit) foot.push(billing.footer);
  if (!inv.vat_registered) foot.push(`${billing.company_name} is not registered for VAT. No VAT has been charged.`);
  for (const f of foot.reverse()) { for (const l of wrap(f, W - 2 * M, font, 8).reverse()) { text(l, M, fy, { size: 8, color: MUTED }); fy += 10; } }
  if (inv.status === "draft") {
    page.drawText("DRAFT", { x: 150, y: 380, size: 110, font: bold, color: rgb(0.9, 0.3, 0.3), opacity: 0.12, rotate: { type: "degrees", angle: 35 } });
  }
  return pdf.save();
}
