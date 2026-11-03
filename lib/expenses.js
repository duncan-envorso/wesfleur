import { put } from "@vercel/blob";
import { db } from "./db";
import { CATEGORY } from "./expense-categories";

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const money = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  let s = String(v).replace(/[\sR]/g, "");
  s = s.includes(".") ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export async function listExpenses({ period, category } = {}) {
  const q = await db();
  const rows = period
    ? await q`SELECT *, amount::float AS amount, vat::float AS vat FROM expenses WHERE period = ${period} ORDER BY spent_on DESC, id DESC`
    : await q`SELECT *, amount::float AS amount, vat::float AS vat FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 500`;
  const list = category ? rows.filter((r) => r.category === category) : rows;
  const byCat = {};
  for (const r of rows) byCat[r.category] = r2((byCat[r.category] || 0) + r.amount);
  const flags = (r) => {
    const c = CATEGORY[r.category];
    const out = [];
    if (!r.receipt_url) out.push("No receipt");
    if (c?.deductible === "no") out.push("Not deductible");
    if (c?.deductible === "partly") out.push("Partly deductible");
    return out;
  };
  return {
    period: period || null,
    rows: list.map((r) => ({ ...r, flags: flags(r) })),
    total: r2(rows.reduce((s, r) => s + r.amount, 0)),
    vat: r2(rows.reduce((s, r) => s + r.vat, 0)),
    missingReceipts: rows.filter((r) => !r.receipt_url).length,
    byCategory: Object.entries(byCat).map(([key, amount]) => ({ key, label: CATEGORY[key]?.label || key, amount })).sort((a, b) => b.amount - a.amount),
  };
}

async function saveReceipt(file, period) {
  if (!file || typeof file !== "object" || !file.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error("Receipt is too large (8 MB max)");
  const ext = (file.name || "").split(".").pop()?.toLowerCase() || "jpg";
  const blob = await put(`expenses/${period}/receipt.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type || undefined });
  return { url: blob.url, name: file.name || `receipt.${ext}` };
}

export async function saveExpense(form, user, id = null) {
  const q = await db();
  const get = (k) => (form.get(k) ?? "").toString().trim();
  const spent = get("spent_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spent)) throw new Error("Enter the date paid");
  const period = /^\d{4}-\d{2}$/.test(get("period")) ? get("period") : spent.slice(0, 7);
  const supplier = get("supplier");
  if (!supplier) throw new Error("Enter who was paid");
  const category = get("category");
  if (!CATEGORY[category]) throw new Error("Choose a category");
  const amount = money(get("amount"));
  if (!amount || !Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount paid, including VAT");
  const vat = money(get("vat")) ?? 0;
  if (!Number.isFinite(vat) || vat < 0 || vat > amount) throw new Error("VAT must be between 0 and the amount");
  const receipt = await saveReceipt(form.get("receipt"), period);
  const v = [spent, period, supplier, category, get("description") || null, r2(amount), r2(vat), get("method") || null,
    get("reference") || null, get("unit_code") || null, get("notes") || null];
  if (id) {
    await q`UPDATE expenses SET spent_on = ${v[0]}, period = ${v[1]}, supplier = ${v[2]}, category = ${v[3]}, description = ${v[4]},
              amount = ${v[5]}, vat = ${v[6]}, method = ${v[7]}, reference = ${v[8]}, unit_code = ${v[9]}, notes = ${v[10]},
              receipt_url = COALESCE(${receipt?.url ?? null}, receipt_url), receipt_name = COALESCE(${receipt?.name ?? null}, receipt_name)
            WHERE id = ${Number(id)}`;
  } else {
    await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, unit_code, notes, receipt_url, receipt_name, created_by)
            VALUES (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}, ${v[8]}, ${v[9]}, ${v[10]}, ${receipt?.url ?? null}, ${receipt?.name ?? null}, ${user || null})`;
  }
}

export async function deleteExpense(id) {
  const q = await db();
  await q`DELETE FROM expenses WHERE id = ${Number(id)}`;
}
