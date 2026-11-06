import { db } from "./db";
import { CATEGORY } from "./expense-categories";
import { CAPITAL_INCOME, INCOME_CATEGORY } from "./income-categories";

const r2 = (n) => Math.round(Number(n) * 100) / 100;
// Not costs of the business: money taken out, personal spending, loan capital, assets bought.
export const BELOW_LINE = new Set(["director_loan", "personal", "bond_capital", "capital"]);
const BILLING_GROUP = { rent: "Rent", opex: "Operating cost recoveries", water: "Utility recoveries", sewerage: "Utility recoveries",
  electricity: "Utility recoveries", fixed: "Utility recoveries", refuse: "Utility recoveries" };

function monthsEnding(to, n) {
  const [y, m] = to.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}

// Monthly P&L: rental income from invoices (issued; a tenant's draft counts until it's issued), other income, expenses.
export async function profitAndLoss(to, n = 6) {
  if (!/^\d{4}-\d{2}$/.test(to || "")) throw new Error("Choose a month");
  const months = monthsEnding(to, Math.min(Math.max(Number(n) || 6, 1), 12));
  const q = await db();
  const lines = await q`SELECT i.id, i.tenant_id, i.period, i.status, l.kind, l.amount::float AS amount
                        FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
                        WHERE i.status IN ('issued', 'draft') AND i.period >= ${months[0]} AND i.period <= ${months.at(-1)}`;
  const issuedKey = new Set(lines.filter((l) => l.status === "issued").map((l) => `${l.tenant_id}|${l.period}`));
  const used = lines.filter((l) => l.status === "issued" || !issuedKey.has(`${l.tenant_id}|${l.period}`));
  const draftMonths = new Set(used.filter((l) => l.status === "draft").map((l) => l.period));
  const income = await q`SELECT period, category, amount::float AS amount FROM income WHERE period >= ${months[0]} AND period <= ${months.at(-1)}`;
  const expenses = await q`SELECT period, category, amount::float AS amount FROM expenses WHERE period >= ${months[0]} AND period <= ${months.at(-1)}`;

  const blank = () => Object.fromEntries(months.map((m) => [m, 0]));
  const add = (map, key, m, v) => { map[key] ||= blank(); map[key][m] = r2(map[key][m] + v); };
  const billing = {}, other = {}, capitalIn = {}, costs = {}, below = {};
  const adjs = await q`SELECT period, amount::float AS amount FROM balance_adjustments WHERE period >= ${months[0]} AND period <= ${months.at(-1)}`;
  for (const a of adjs) add(billing, "Balances waived", a.period, a.amount);
  for (const l of used) add(billing, BILLING_GROUP[l.kind] || "Other billing (arrears, adjustments)", l.period, l.amount);
  for (const r of income) add(CAPITAL_INCOME.has(r.category) ? capitalIn : other, INCOME_CATEGORY[r.category]?.label || r.category, r.period, r.amount);
  for (const e of expenses) add(BELOW_LINE.has(e.category) ? below : costs, CATEGORY[e.category]?.label || e.category, e.period, e.amount);

  const total = (map) => { const t = blank(); for (const row of Object.values(map)) for (const m of months) t[m] = r2(t[m] + row[m]); return t; };
  const toRows = (map, order) => Object.entries(map).map(([label, values]) => ({ label, values, sum: r2(months.reduce((s, m) => s + values[m], 0)) }))
    .sort((a, b) => (order ? order.indexOf(a.label) - order.indexOf(b.label) : b.sum - a.sum));
  const billingOrder = ["Rent", "Operating cost recoveries", "Utility recoveries", "Other billing (arrears, adjustments)", "Balances waived"];
  const incomeTotal = blank(), costTotal = total(costs), profit = blank();
  const bt = total(billing), ot = total(other);
  for (const m of months) { incomeTotal[m] = r2(bt[m] + ot[m]); profit[m] = r2(incomeTotal[m] - costTotal[m]); }
  return {
    months, draftMonths: [...draftMonths],
    billing: toRows(billing, billingOrder), other: toRows(other), income: incomeTotal,
    costs: toRows(costs), costTotal, profit,
    capitalIncome: toRows(capitalIn), below: toRows(below), belowTotal: total(below),
  };
}
