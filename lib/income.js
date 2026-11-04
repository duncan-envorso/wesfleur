import { db } from "./db";
import { INCOME_CATEGORY } from "./income-categories";

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const money = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  let s = String(v).replace(/[\sR]/g, "");
  s = s.includes(".") ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export async function listIncome({ period, category } = {}) {
  const q = await db();
  const rows = period
    ? await q`SELECT *, amount::float AS amount FROM income WHERE period = ${period} ORDER BY received_on DESC, id DESC`
    : await q`SELECT *, amount::float AS amount FROM income ORDER BY received_on DESC, id DESC LIMIT 500`;
  const byCat = {};
  for (const r of rows) byCat[r.category] = r2((byCat[r.category] || 0) + r.amount);
  return {
    period: period || null,
    rows: category ? rows.filter((r) => r.category === category) : rows,
    total: r2(rows.reduce((s, r) => s + r.amount, 0)),
    byCategory: Object.entries(byCat).map(([key, amount]) => ({ key, label: INCOME_CATEGORY[key]?.label || key, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export async function saveIncome(body, user, id = null) {
  const q = await db();
  const on = String(body.received_on || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error("Enter the date received");
  const period = /^\d{4}-\d{2}$/.test(body.period || "") ? body.period : on.slice(0, 7);
  if (!body.payer) throw new Error("Enter who paid");
  if (!INCOME_CATEGORY[body.category]) throw new Error("Choose a category");
  const amount = money(body.amount);
  if (!amount || !Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount received");
  const v = [on, period, String(body.payer), body.category, body.description || null, r2(amount), body.method || null, body.reference || null, body.notes || null];
  if (id) {
    await q`UPDATE income SET received_on = ${v[0]}, period = ${v[1]}, payer = ${v[2]}, category = ${v[3]}, description = ${v[4]},
              amount = ${v[5]}, method = ${v[6]}, reference = ${v[7]}, notes = ${v[8]} WHERE id = ${Number(id)}`;
  } else {
    await q`INSERT INTO income (received_on, period, payer, category, description, amount, method, reference, notes, created_by)
            VALUES (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}, ${v[8]}, ${user || null})`;
  }
}

export async function deleteIncome(id) {
  const q = await db();
  await q`DELETE FROM income WHERE id = ${Number(id)}`;
}
