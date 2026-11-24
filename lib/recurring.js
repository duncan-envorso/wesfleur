// Recurring monthly costs: what should be paid each month (set up once), matched against the
// expenses actually recorded, plus the City's fixed charges taken from each month's City bill.
import { db, getTariffs } from "./db";
import { getBilling } from "./billing";
import { CATEGORY } from "./expense-categories";

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const clean = (v) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const FREQ = { monthly: 1, quarterly: 3, yearly: 12 };
const PERIOD_RE = /^\d{4}-\d{2}$/;
const thisPeriod = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" }).slice(0, 7);
const addMonths = (p, n) => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthIndex = (p) => { const [y, m] = p.split("-").map(Number); return y * 12 + m - 1; };

export async function createRecurringSchema(q) {
  await q`CREATE TABLE IF NOT EXISTS recurring_costs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    supplier TEXT,
    match_text TEXT,
    category TEXT,
    amount NUMERIC(12,2) NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    due_day INT,
    start_period TEXT NOT NULL,
    end_period TEXT,
    method TEXT,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_id INT`;

  // One-off: Renasa building/business insurance (Duncan, 24 Nov 2026). Debit order on the 7th via ECIA;
  // latest premium R5,995.43 (7 Nov 2026 FNB statement).
  await q`CREATE TABLE IF NOT EXISTS data_updates (id TEXT PRIMARY KEY)`;
  const [done] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'recurring-renasa-2026-11'`;
  if (!done) {
    const [have] = await q`SELECT 1 AS x FROM recurring_costs WHERE match_text ILIKE '%renasa%' OR supplier ILIKE '%renasa%'`;
    if (!have) {
      await q`INSERT INTO recurring_costs (name, supplier, match_text, category, amount, frequency, due_day, start_period, method, notes)
              VALUES ('Building insurance (Renasa)', 'Renasa Insurance', 'Renasa', 'insurance', 5995.43, 'monthly', 7, '2026-11', 'Debit order',
                      'Debit order via ECIA, ref ECIARENASADBNR000252. Premium was R6,296.61 (Sep), R5,395.43 (Oct), R5,995.43 (Nov 2026).')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('recurring-renasa-2026-11') ON CONFLICT DO NOTHING`;
  }
}

// Is this cost due in this month?
function dueIn(item, period) {
  if (period < item.start_period) return false;
  if (item.end_period && period > item.end_period) return false;
  const step = FREQ[item.frequency] || 1;
  return (monthIndex(period) - monthIndex(item.start_period)) % step === 0;
}

const matches = (item, e) => {
  if (e.recurring_id) return e.recurring_id === item.id;
  // By supplier only: one payment is often booked as several expenses (e.g. a bond's interest, capital and fee).
  const needle = (item.match_text || item.supplier || "").trim().toLowerCase();
  return !!needle && e.supplier.toLowerCase().includes(needle);
};

/** Months from `from` to `to` (inclusive). */
export async function monthlyCosts({ to = null, months = 6, ahead = 1 } = {}) {
  const q = await db();
  const now = thisPeriod();
  const last = to && PERIOD_RE.test(to) ? to : addMonths(now, ahead);
  const n = Math.min(Math.max(Number(months) || 6, 3), 24);
  const periods = Array.from({ length: n + (to ? 0 : ahead) }, (_, i) => addMonths(last, i - (n + (to ? 0 : ahead)) + 1));
  const first = periods[0];

  const items = (await q`SELECT * FROM recurring_costs ORDER BY active DESC, category, name`).map((x) => ({ ...x, amount: Number(x.amount) }));
  const expenses = (await q`SELECT id, spent_on, period, supplier, category, amount::float AS amount, recurring_id FROM expenses
                            WHERE period >= ${addMonths(first, -6)} AND period <= ${periods.at(-1)}`);

  // Recurring payments: expected vs paid.
  const used = new Set();
  const rows = items.map((it) => {
    const cells = periods.map((p) => {
      const exp = it.active || p <= now ? (dueIn(it, p) ? it.amount : 0) : 0;
      const paidList = expenses.filter((e) => e.period === p && matches(it, e));
      paidList.forEach((e) => used.add(e.id));
      const paid = r2(paidList.reduce((s, e) => s + e.amount, 0));
      let status = "none";
      if (exp && paid >= exp - 0.5 && paid <= exp + 0.5) status = "paid";
      else if (paid && exp) status = "differs";
      else if (paid && !exp) status = "extra";
      else if (exp && p < now) status = "missing";
      else if (exp && p === now) status = "due";
      else if (exp) status = "planned";
      return { period: p, expected: r2(exp), paid, status, expenses: paidList.map((e) => e.id) };
    });
    return { ...it, category_label: CATEGORY[it.category]?.label || null, cells };
  });

  // City fixed charges from each month's City bill (as paid: incl. VAT while not VAT-registered; rates carry no VAT).
  const tariffs = await getTariffs();
  const billing = await getBilling();
  const bills = await q`SELECT period, rates::float, water_fixed::float, sewer_fixed::float, refuse::float, bulk_elec_fixed::float,
                               water_use::float, sewer_use::float, bulk_elec::float, other_charges::float
                        FROM city_bills WHERE period >= ${first} AND period <= ${periods.at(-1)}`;
  const billItems = await q`SELECT period, service, shared, amount::float FROM city_bill_items WHERE period >= ${first} AND period <= ${periods.at(-1)}`;
  const itemSum = (p, f) => billItems.filter((i) => i.period === p && f(i)).reduce((s, i) => s + (i.amount || 0), 0);
  const vatFor = (p) => (billing.vat_registered_from && `${p}-01` >= billing.vat_registered_from.slice(0, 7) + "-01" ? 1 : 1 + (tariffs.add_vat ? Number(tariffs.vat_rate) : 0));
  const CITY = [
    { key: "rates", name: "Property rates", vat: false },
    { key: "water_sewer_fixed", name: "Fixed water & sewerage charges", vat: true, get: (b) => (b.water_fixed || 0) + (b.sewer_fixed || 0) },
    { key: "refuse", name: "Refuse removal", vat: true },
    { key: "bulk_elec_fixed", name: "Electricity service & wires charge (bulk supply)", vat: true },
  ];
  // Usage-based City charges (excl. VAT on the bill; bulk_elec includes the fixed service charge counted above).
  const CITY_USE = [
    { key: "tenant_elec", name: "Electricity, tenant meters on your account", note: "recharged to the tenant", vat: true,
      get: (b, p) => itemSum(p, (i) => !i.shared && i.service === "electricity") },
    { key: "bulk_elec_use", name: "Bulk electricity used (Citiq prepaid shops)", note: "partly recovered through Citiq", vat: true,
      get: (b) => Math.max(0, (b.bulk_elec || 0) - (b.bulk_elec_fixed || 0)) },
    { key: "water_sewer_use", name: "Water & sewerage used", note: "recharged from sub-meters", vat: true,
      get: (b, p) => (b.water_use || 0) + (b.sewer_use || 0) + itemSum(p, (i) => i.shared || i.service !== "electricity") },
    { key: "other_charges", name: "Late-payment / dunning charges", note: "avoidable", vat: true, get: (b) => b.other_charges || 0 },
  ];
  const cityRows = (list) => list.map((c) => ({
    key: c.key, name: c.name, note: c.note || null,
    cells: periods.map((p) => {
      const b = bills.find((x) => x.period === p);
      if (!b) return { period: p, amount: null };
      const raw = c.get ? c.get(b, p) : b[c.key] || 0;
      return { period: p, amount: r2(raw * (c.vat ? vatFor(p) : 1)) };
    }),
  }));
  const city = cityRows(CITY);
  const cityUse = cityRows(CITY_USE).filter((c) => c.cells.some((x) => x.amount));

  // Suppliers paid in 3+ of the last 6 months that aren't tracked yet.
  const recent = expenses.filter((e) => e.period >= addMonths(now, -6) && e.period <= now && !used.has(e.id) && !e.recurring_id
    && !["director_loan", "personal", "capital", "municipal"].includes(e.category));
  const bySupplier = {};
  for (const e of recent) {
    const k = e.supplier.trim().toLowerCase();
    const s = (bySupplier[k] ||= { supplier: e.supplier.trim(), months: new Set(), total: 0, count: 0, cats: {} });
    s.months.add(e.period); s.total += e.amount; s.count++; s.cats[e.category] = (s.cats[e.category] || 0) + 1;
  }
  const covered = (sup) => items.some((it) => { const nd = (it.match_text || it.supplier || "").toLowerCase(); return nd && sup.toLowerCase().includes(nd); });
  const suggestions = Object.values(bySupplier).filter((s) => s.months.size >= 3 && !covered(s.supplier)).map((s) => {
    const category = Object.entries(s.cats).sort((a, b) => b[1] - a[1])[0][0];
    return { supplier: s.supplier, months: s.months.size, monthly: r2(s.total / s.months.size), category, category_label: CATEGORY[category]?.label || category };
  }).sort((a, b) => b.monthly - a.monthly);

  // Totals per month.
  const totals = periods.map((p, i) => {
    const expected = r2(rows.reduce((s, r) => s + r.cells[i].expected, 0));
    const paid = r2(rows.reduce((s, r) => s + r.cells[i].paid, 0));
    const cityAmt = city.every((c) => c.cells[i].amount === null) ? null : r2(city.reduce((s, c) => s + (c.cells[i].amount || 0), 0));
    const useAmt = cityAmt === null ? null : r2(cityUse.reduce((s, c) => s + (c.cells[i].amount || 0), 0));
    return { period: p, expected, paid, city: cityAmt, city_use: useAmt, city_total: cityAmt === null ? null : r2(cityAmt + useAmt), outstanding: r2(rows.reduce((s, r) => s + (["due", "missing"].includes(r.cells[i].status) ? r.cells[i].expected : 0), 0)) };
  });
  const ci = periods.indexOf(now);
  const dueNow = ci < 0 ? [] : rows.filter((r) => ["due", "missing"].includes(r.cells[ci].status))
    .map((r) => ({ id: r.id, name: r.name, amount: r.cells[ci].expected, due_day: r.due_day }));

  return { now, periods, rows, city, city_use: cityUse, totals, suggestions, due_now: dueNow };
}

export async function saveRecurring(body, id = null) {
  const q = await db();
  const name = clean(body.name);
  if (!name) throw new Error("Give it a name, e.g. Building insurance");
  const amount = r2(String(body.amount ?? "").replace(/[\sR]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, ""));
  if (!(amount > 0)) throw new Error("Enter the amount you expect to pay");
  const frequency = FREQ[body.frequency] ? body.frequency : "monthly";
  const start = clean(body.start_period) || thisPeriod();
  const end = clean(body.end_period);
  if (!PERIOD_RE.test(start) || (end && !PERIOD_RE.test(end))) throw new Error("Months must look like 2026-11");
  if (end && end < start) throw new Error("The last month is before the first month");
  const due = body.due_day ? Math.min(Math.max(parseInt(body.due_day, 10) || 0, 1), 31) : null;
  const category = body.category && CATEGORY[body.category] ? body.category : null;
  const supplier = clean(body.supplier);
  const v = [name, supplier, clean(body.match_text) || supplier, category, amount, frequency, due, start, end, clean(body.method), clean(body.notes), body.active !== false];
  if (id) {
    const [r] = await q`UPDATE recurring_costs SET name = ${v[0]}, supplier = ${v[1]}, match_text = ${v[2]}, category = ${v[3]}, amount = ${v[4]},
                          frequency = ${v[5]}, due_day = ${v[6]}, start_period = ${v[7]}, end_period = ${v[8]}, method = ${v[9]}, notes = ${v[10]}, active = ${v[11]}
                        WHERE id = ${Number(id)} RETURNING id`;
    if (!r) throw new Error("Not found");
    return { id: r.id };
  }
  const [r] = await q`INSERT INTO recurring_costs (name, supplier, match_text, category, amount, frequency, due_day, start_period, end_period, method, notes, active)
                      VALUES (${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}, ${v[8]}, ${v[9]}, ${v[10]}, ${v[11]}) RETURNING id`;
  return { id: r.id };
}

export async function deleteRecurring(id) {
  const q = await db();
  await q`UPDATE expenses SET recurring_id = NULL WHERE recurring_id = ${Number(id)}`;
  await q`DELETE FROM recurring_costs WHERE id = ${Number(id)}`;
  return { ok: true };
}

// Records this month's payment as an expense, at the expected amount (edit it on Expenses if it differed).
export async function markPaid(id, period, user) {
  const q = await db();
  const [it] = await q`SELECT * FROM recurring_costs WHERE id = ${Number(id)}`;
  if (!it) throw new Error("Not found");
  if (!PERIOD_RE.test(period || "")) throw new Error("Choose the month");
  if (!it.category) throw new Error("Give this cost a category first (edit it), so the expense is filed correctly");
  const [dup] = await q`SELECT id FROM expenses WHERE recurring_id = ${it.id} AND period = ${period}`;
  if (dup) throw new Error("Already recorded for that month");
  const day = String(Math.min(it.due_day || 1, 28)).padStart(2, "0");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const spent = period === today.slice(0, 7) ? today : `${period}-${day}`;
  const [e] = await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, recurring_id, created_by)
                      VALUES (${spent}, ${period}, ${it.supplier || it.name}, ${it.category}, ${it.name}, ${it.amount}, 0, ${it.method || "Debit order"}, ${it.id}, ${user || null})
                      RETURNING id`;
  return { expense_id: e.id };
}
