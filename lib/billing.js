import { db, getTariffs } from "./db";
import { DEFAULT_BILLING } from "./billing-schema";
import { calculate } from "./calc";
import { anniversaries, compound, isCurrent, leaseState, todayIso } from "./leases";

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v === null || v === undefined ? null : Number(v));
const MON = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const periodLabel = (p) => `${MON[Number(p.slice(5, 7))]} ${p.slice(0, 4)}`;
const kl = (n) => Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const addDays = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);

export async function getBilling() {
  const q = await db();
  const [row] = await q`SELECT value FROM settings WHERE key = 'billing'`;
  return { ...DEFAULT_BILLING, ...(row?.value || {}) };
}

export async function saveBilling(body) {
  const q = await db();
  const cur = await getBilling();
  const next = { ...cur };
  for (const k of Object.keys(DEFAULT_BILLING)) {
    if (!(k in body)) continue;
    next[k] = ["vat_rate", "due_days", "building_area_m2"].includes(k) ? Number(body[k]) : String(body[k] ?? "");
  }
  if (next.vat_registered_from && !/^\d{4}-\d{2}-\d{2}$/.test(next.vat_registered_from)) throw new Error("VAT registration date must be a date");
  await q`INSERT INTO settings (key, value) VALUES ('billing', ${JSON.stringify(next)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (body.next_number) {
    const n = Number(body.next_number);
    if (!Number.isInteger(n) || n < 1) throw new Error("Next invoice number must be a whole number");
    const [{ c }] = await q`SELECT count(*)::int AS c FROM invoices WHERE kind = 'invoice' AND number IS NOT NULL`;
    if (c > 0) throw new Error("Invoices have already been issued from the app, so the numbering can't be changed");
    await q.query(`SELECT setval('invoice_number_seq', $1, false)`, [n]);
  }
  return getBilling();
}

export async function nextNumberPreview() {
  const q = await db();
  const [r] = await q`SELECT last_value, is_called FROM invoice_number_seq`;
  return Number(r.is_called ? Number(r.last_value) + 1 : r.last_value);
}

const vatApplies = (b, issueDate) => !!b.vat_registered_from && issueDate >= b.vat_registered_from;

// Operating costs for the month: base amount escalated on each anniversary of the lease start.
export function opexFor(lease, monthStart) {
  const base = num(lease.opex_amount);
  if (!base) return null;
  const pct = num(lease.opex_escalation_pct) || 0;
  if (!lease.start_date) return base;
  const [, m, d] = lease.start_date.split("-").map(Number);
  const steps = anniversaries({ m, d }, lease.start_date, monthStart, lease.start_date).length;
  return compound(base, pct, steps);
}

// Builds the lines for one tenant's invoice from their lease, unit and the month's meter readings.
export async function buildLines({ lease, unit, period, meters, tariffs, vat, city }) {
  const monthStart = `${period}-01`;
  const lines = [];
  const warnings = [];
  const label = periodLabel(period);
  const unitName = unit?.name || "unit";

  const st = leaseState(lease, monthStart);
  const rent = st.expectedRent ?? num(lease.current_rent);
  if (rent !== null) {
    lines.push({ kind: "rent", description: `Rent – ${unitName} – ${label}`, quantity: 1, unit: "month", unit_price: rent, amount: r2(rent) });
    if (st.missed.length) {
      warnings.push(`Rent includes ${st.missed.length} increase(s) not yet recorded on the lease (from ${st.missed[0]}). Record it on the tenant page after issuing.`);
    }
  } else warnings.push("No rent recorded on the lease.");

  const opex = opexFor(lease, monthStart);
  if (opex) lines.push({ kind: "opex", description: `Operating costs – ${label}`, quantity: 1, unit: "month", unit_price: opex, amount: r2(opex) });

  // Utilities are recharged at the City's cost: VAT-inclusive while not registered, ex VAT (plus output VAT) once registered.
  const t = { ...tariffs, add_vat: vat ? false : tariffs.add_vat };
  for (const m of meters.filter((x) => unit && x.shop === unit.code && x.recharge && !x.is_main)) {
    const what = m.type === "electricity" ? "Electricity" : "Water";
    if (m.current === null || m.previous === null) {
      warnings.push(`${m.name}: ${m.current === null ? "no reading" : "no previous reading"} for ${label} — ${what.toLowerCase()} not charged.`);
      continue;
    }
    const c = calculate({ type: m.type, previous: m.previous, current: m.current }, t);
    if (c.warning) { warnings.push(`${m.name}: ${c.warning}`); continue; }
    const unitTxt = m.type === "electricity" ? "kWh" : "kL";
    for (const l of c.lines) {
      const desc = l.label === "Sewerage"
        ? `Sewerage – ${Math.round(t.sewer_pct * 100)}% of water used`
        : `${what} – meter ${kl(m.previous)} → ${kl(m.current)}`;
      lines.push({ kind: l.label.toLowerCase(), description: desc, quantity: Math.round(l.qty * 1000) / 1000, unit: unitTxt,
        unit_price: r2(l.amount / (l.qty || 1)), amount: l.amount });
    }
  }
  // Shared City charges split by floor area: fixed water/sewerage connection charges and refuse.
  if (city?.bill) {
    const area = num(unit?.area_m2);
    if (!area) warnings.push(`${unitName} has no floor area recorded — fixed charges and refuse not split. Add it under Settings → Units.`);
    else if (!city.denominator) warnings.push("No area to split the City bill over — check Settings → Invoices.");
    else {
      const share = area / city.denominator;
      const gross = vat ? 1 : 1 + (tariffs.add_vat ? tariffs.vat_rate : 0); // City amounts are excl. VAT
      const pct = `${(share * 100).toFixed(2)}%`;
      const fixed = (num(city.bill.water_fixed) + num(city.bill.sewer_fixed)) * share * gross;
      if (fixed > 0) lines.push({ kind: "fixed", description: `Fixed water & sewerage charges – ${pct} of City basic charges (${area} m² of ${city.denominator} m²)`,
        quantity: null, unit: null, unit_price: null, amount: r2(fixed) });
      const ref = num(city.bill.refuse) * share * gross;
      if (ref > 0) lines.push({ kind: "refuse", description: `Refuse removal – ${pct} of City refuse charge`, quantity: null, unit: null, unit_price: null, amount: r2(ref) });
    }
  } else {
    warnings.push(`No City bill entered for ${label} — fixed water & sewerage charges not billed${num(unit?.refuse_monthly) ? "; refuse uses the unit's standing amount" : ""}.`);
    const refuse = num(unit?.refuse_monthly);
    if (refuse) lines.push({ kind: "refuse", description: `Refuse removal – ${label}`, quantity: 1, unit: "month", unit_price: refuse, amount: r2(refuse) });
  }
  return { lines: lines.map((l, i) => ({ ...l, sort: i })), warnings };
}

function totals(lines, vat, rate) {
  const subtotal = r2(lines.reduce((s, l) => s + Number(l.amount), 0));
  const v = vat ? r2(subtotal * rate) : 0;
  return { subtotal, vat: v, total: r2(subtotal + v) };
}

async function saveLines(q, invoiceId, lines) {
  await q`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}`;
  let i = 0;
  for (const l of lines) {
    const amount = r2(l.amount ?? (Number(l.quantity || 1) * Number(l.unit_price || 0)));
    if (!l.description) continue;
    await q`INSERT INTO invoice_lines (invoice_id, sort, kind, description, quantity, unit, unit_price, amount)
            VALUES (${invoiceId}, ${i++}, ${l.kind || "other"}, ${l.description}, ${l.quantity ?? null}, ${l.unit || null},
                    ${l.unit_price ?? null}, ${amount})`;
  }
}

async function context(period) {
  const q = await db();
  const { buildReport } = await import("./report");
  const [report, tariffs, billing] = [await buildReport(period), await getTariffs(), await getBilling()];
  const leases = await q`SELECT l.*, t.trading_name FROM leases l JOIN tenants t ON t.id = l.tenant_id ORDER BY l.id`;
  const units = await q`SELECT * FROM units`;
  const [bill] = await q`SELECT * FROM city_bills WHERE period = ${period}`;
  const monthStart = `${period}-01`;
  const letUnits = new Set(leases.filter((l) => isCurrent(l, monthStart) && l.unit_id).map((l) => l.unit_id));
  const letArea = units.filter((u) => letUnits.has(u.id)).reduce((s, u) => s + (num(u.area_m2) || 0), 0);
  const denominator = billing.utility_split === "total" ? num(billing.building_area_m2) : letArea;
  return { q, meters: report.meters, tariffs, billing, leases, units, city: { bill: bill || null, denominator, letArea } };
}

// Creates a draft for every tenant with a current lease who has no invoice for the month yet.
export async function prepareDrafts(period, user) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Choose a month");
  const { q, meters, tariffs, billing, leases, units, city } = await context(period);
  const monthStart = `${period}-01`;
  const issue = todayIso();
  const vat = vatApplies(billing, issue);
  const byTenant = new Map();
  for (const l of leases) if (isCurrent(l, monthStart)) byTenant.set(l.tenant_id, l); // latest current lease wins
  const existing = new Set((await q`SELECT tenant_id FROM invoices WHERE period = ${period} AND kind = 'invoice' AND status <> 'void'`).map((r) => r.tenant_id));
  let created = 0;
  for (const [tenantId, lease] of byTenant) {
    if (existing.has(tenantId)) continue;
    const unit = units.find((u) => u.id === lease.unit_id);
    const { lines, warnings } = await buildLines({ lease, unit, period, meters, tariffs, vat, city });
    const tt = totals(lines, vat, billing.vat_rate);
    const [inv] = await q`
      INSERT INTO invoices (tenant_id, lease_id, period, status, issue_date, due_date, vat_registered, subtotal, vat, total, warnings, created_by)
      VALUES (${tenantId}, ${lease.id}, ${period}, 'draft', ${issue}, ${addDays(issue, billing.due_days)}, ${vat},
              ${tt.subtotal}, ${tt.vat}, ${tt.total}, ${JSON.stringify(warnings)}, ${user || null})
      RETURNING id`;
    await saveLines(q, inv.id, lines);
    created++;
  }
  return { created, skipped: existing.size };
}

// Rebuilds a draft's lines from the lease and readings (e.g. after a reading is corrected).
export async function refreshDraft(id) {
  const inv = await getInvoice(id);
  if (inv.status !== "draft") throw new Error("Only drafts can be refreshed");
  const { q, meters, tariffs, billing, units, city } = await context(inv.period);
  const [lease] = await q`SELECT * FROM leases WHERE id = ${inv.lease_id}`;
  const unit = units.find((u) => u.id === lease?.unit_id);
  const vat = vatApplies(billing, inv.issue_date || todayIso());
  const { lines, warnings } = await buildLines({ lease, unit, period: inv.period, meters, tariffs, vat, city });
  const extra = inv.lines.filter((l) => ["arrears", "other", "credit"].includes(l.kind)); // keep manual lines
  const all = [...lines, ...extra];
  await saveLines(q, id, all);
  const tt = totals(all, vat, billing.vat_rate);
  await q`UPDATE invoices SET vat_registered = ${vat}, subtotal = ${tt.subtotal}, vat = ${tt.vat}, total = ${tt.total},
            warnings = ${JSON.stringify(warnings)} WHERE id = ${id}`;
}

export async function refreshAllDrafts(period) {
  const q = await db();
  const drafts = await q`SELECT id FROM invoices WHERE period = ${period} AND status = 'draft'`;
  for (const d of drafts) await refreshDraft(d.id);
  return { refreshed: drafts.length };
}

export async function updateDraft(id, body) {
  const q = await db();
  const inv = await getInvoice(id);
  if (inv.status !== "draft") throw new Error("This invoice has been issued and can't be changed. Issue a credit note instead.");
  const billing = await getBilling();
  const issue = body.issue_date || inv.issue_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue || "")) throw new Error("Enter the invoice date");
  const due = body.due_date || inv.due_date;
  const vat = vatApplies(billing, issue);
  const lines = (body.lines || inv.lines).map((l) => {
    const qty = l.quantity === "" || l.quantity === null || l.quantity === undefined ? null : Number(String(l.quantity).replace(",", "."));
    const price = l.unit_price === "" || l.unit_price === null || l.unit_price === undefined ? null : Number(String(l.unit_price).replace(/\s/g, "").replace(",", "."));
    let amount = l.amount === "" || l.amount === undefined || l.amount === null ? null : Number(String(l.amount).replace(/\s/g, "").replace(",", "."));
    if (amount === null && price !== null) amount = (qty ?? 1) * price;
    if (amount === null || !Number.isFinite(amount)) throw new Error(`Enter an amount for “${l.description || "a line"}”`);
    return { ...l, quantity: qty, unit_price: price, amount: r2(amount) };
  });
  await saveLines(q, id, lines);
  const tt = totals(lines, vat, billing.vat_rate);
  await q`UPDATE invoices SET issue_date = ${issue}, due_date = ${due}, notes = ${body.notes ?? inv.notes},
            vat_registered = ${vat}, subtotal = ${tt.subtotal}, vat = ${tt.vat}, total = ${tt.total} WHERE id = ${id}`;
}

export async function issueInvoice(id, user) {
  const q = await db();
  const inv = await getInvoice(id);
  if (inv.status !== "draft") throw new Error("Already issued");
  if (!inv.lines.length) throw new Error("This invoice has no lines");
  const billing = await getBilling();
  const vat = vatApplies(billing, inv.issue_date);
  if (vat && !billing.vat_number) throw new Error("Add the company's VAT number in Settings before issuing tax invoices");
  const tt = totals(inv.lines, vat, billing.vat_rate);
  const [{ n }] = await q`SELECT nextval('invoice_number_seq')::int AS n`;
  const number = `${billing.prefix}${String(n).padStart(7, "0")}`;
  await q`UPDATE invoices SET status = 'issued', number = ${number}, vat_registered = ${vat}, subtotal = ${tt.subtotal},
            vat = ${tt.vat}, total = ${tt.total}, issued_by = ${user || null}, issued_at = now() WHERE id = ${id}`;
  return number;
}

export async function issueAll(period, user) {
  const q = await db();
  const drafts = await q`SELECT i.id FROM invoices i JOIN tenants t ON t.id = i.tenant_id
                         WHERE i.period = ${period} AND i.status = 'draft' AND i.kind = 'invoice' ORDER BY t.trading_name`;
  const out = [];
  for (const d of drafts) out.push(await issueInvoice(d.id, user));
  return out;
}

export async function deleteDraft(id) {
  const q = await db();
  const inv = await getInvoice(id);
  if (inv.status !== "draft") throw new Error("Issued invoices can't be deleted. Issue a credit note instead.");
  await q`DELETE FROM invoices WHERE id = ${id}`;
}

// Credit note reversing all (or the given) lines of an issued invoice.
export async function creditNote(id, { reason, user }) {
  const q = await db();
  const inv = await getInvoice(id);
  if (inv.status !== "issued" || inv.kind !== "invoice") throw new Error("Only issued invoices can be credited");
  if (inv.credited_by) throw new Error(`Already credited by ${inv.credited_by}`);
  const billing = await getBilling();
  const [{ n }] = await q`SELECT nextval('credit_number_seq')::int AS n`;
  const number = `${billing.credit_prefix}${String(n).padStart(7, "0")}`;
  const today = todayIso();
  const [cn] = await q`
    INSERT INTO invoices (kind, number, tenant_id, lease_id, period, status, issue_date, due_date, vat_registered,
                          subtotal, vat, total, credit_of, notes, created_by, issued_by, issued_at)
    VALUES ('credit', ${number}, ${inv.tenant_id}, ${inv.lease_id}, ${inv.period}, 'issued', ${today}, ${today}, ${inv.vat_registered},
            ${-inv.subtotal}, ${-inv.vat}, ${-inv.total}, ${inv.id}, ${reason || `Credit for ${inv.number}`}, ${user || null}, ${user || null}, now())
    RETURNING id`;
  await saveLines(q, cn.id, inv.lines.map((l) => ({ ...l, unit_price: l.unit_price === null ? null : -l.unit_price, amount: -l.amount })));
  return number;
}

export async function getInvoice(id) {
  const q = await db();
  const [inv] = await q`SELECT i.*, t.trading_name, t.legal_name, t.vat_no AS tenant_vat_no, t.postal_address, t.reg_no AS tenant_reg_no,
                          u.name AS unit_name, c.number AS credit_of_number
                        FROM invoices i JOIN tenants t ON t.id = i.tenant_id
                        LEFT JOIN leases l ON l.id = i.lease_id LEFT JOIN units u ON u.id = l.unit_id
                        LEFT JOIN invoices c ON c.id = i.credit_of
                        WHERE i.id = ${Number(id)}`;
  if (!inv) throw new Error("Invoice not found");
  const lines = (await q`SELECT * FROM invoice_lines WHERE invoice_id = ${inv.id} ORDER BY sort, id`)
    .map((l) => ({ ...l, quantity: num(l.quantity), unit_price: num(l.unit_price), amount: Number(l.amount) }));
  const [cred] = await q`SELECT number FROM invoices WHERE credit_of = ${inv.id} AND kind = 'credit'`;
  const out = { ...inv, subtotal: Number(inv.subtotal), vat: Number(inv.vat), total: Number(inv.total), lines, credited_by: cred?.number || null };
  out.statement = await statementFor(out);
  return out;
}

// Opening balance = issued documents before this one − payments up to its date.
async function statementFor(inv) {
  const q = await db();
  const asOf = inv.issue_date || todayIso();
  const [{ billed }] = await q`SELECT COALESCE(sum(total), 0)::float AS billed FROM invoices
                               WHERE tenant_id = ${inv.tenant_id} AND status = 'issued' AND id <> ${inv.id}
                                 AND (issued_at < COALESCE(${inv.issued_at}::timestamptz, now()))`;
  const [{ paid }] = await q`SELECT COALESCE(sum(amount), 0)::float AS paid FROM payments
                             WHERE tenant_id = ${inv.tenant_id} AND paid_on <= ${asOf}`;
  const opening = r2(billed - paid);
  return { opening, billed: r2(billed), paid: r2(paid), due: r2(opening + inv.total) };
}

export async function listInvoices(period) {
  const q = await db();
  const rows = await q`SELECT i.id, i.kind, i.number, i.status, i.period, i.issue_date, i.due_date, i.total::float AS total,
                         i.warnings, i.tenant_id, t.trading_name, u.name AS unit_name,
                         (SELECT number FROM invoices c WHERE c.credit_of = i.id) AS credited_by
                       FROM invoices i JOIN tenants t ON t.id = i.tenant_id
                       LEFT JOIN leases l ON l.id = i.lease_id LEFT JOIN units u ON u.id = l.unit_id
                       WHERE i.period = ${period} ORDER BY u.sort NULLS LAST, t.trading_name, i.id`;
  return rows;
}

export async function balances() {
  const q = await db();
  return q`SELECT t.id, t.trading_name,
             COALESCE((SELECT sum(total) FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'issued'), 0)::float AS billed,
             COALESCE((SELECT sum(amount) FROM payments p WHERE p.tenant_id = t.id), 0)::float AS paid,
             (SELECT max(paid_on) FROM payments p WHERE p.tenant_id = t.id) AS last_paid
           FROM tenants t
           WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'issued')
              OR EXISTS (SELECT 1 FROM payments p WHERE p.tenant_id = t.id)
           ORDER BY t.trading_name`;
}

export async function addPayment(body, user) {
  const q = await db();
  const amount = Number(String(body.amount ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number(body.tenant_id)) throw new Error("Choose the tenant");
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter the amount received");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.paid_on || "")) throw new Error("Enter the date received");
  await q`INSERT INTO payments (tenant_id, paid_on, amount, reference, note, created_by)
          VALUES (${Number(body.tenant_id)}, ${body.paid_on}, ${r2(amount)}, ${body.reference || null}, ${body.note || null}, ${user || null})`;
}

export async function listPayments(tenantId) {
  const q = await db();
  return tenantId
    ? q`SELECT p.*, p.amount::float AS amount, t.trading_name FROM payments p JOIN tenants t ON t.id = p.tenant_id WHERE p.tenant_id = ${Number(tenantId)} ORDER BY paid_on DESC, id DESC`
    : q`SELECT p.*, p.amount::float AS amount, t.trading_name FROM payments p JOIN tenants t ON t.id = p.tenant_id ORDER BY paid_on DESC, id DESC LIMIT 100`;
}

export async function deletePayment(id) {
  const q = await db();
  await q`DELETE FROM payments WHERE id = ${Number(id)}`;
}

// ---- City bill ----
const CITY_NUM = ["water_fixed", "sewer_fixed", "refuse", "water_kl"];

export async function getCityBill(period) {
  const ctx = await context(period);
  const { q, units, leases, city, billing, meters, tariffs } = ctx;
  const monthStart = `${period}-01`;
  const current = new Map();
  for (const l of leases) if (isCurrent(l, monthStart) && l.unit_id) current.set(l.unit_id, l);
  const bill = city.bill ? Object.fromEntries(Object.entries(city.bill).map(([k, v]) => [k, CITY_NUM.includes(k) && v !== null ? Number(v) : v])) : null;
  const gross = 1 + (tariffs.add_vat ? tariffs.vat_rate : 0);
  const split = units.filter((u) => current.has(u.id)).map((u) => {
    const share = num(u.area_m2) && city.denominator ? num(u.area_m2) / city.denominator : null;
    return {
      unit: u.name, code: u.code, tenant: current.get(u.id).trading_name, area: num(u.area_m2), share,
      fixed: bill && share !== null ? r2((bill.water_fixed + bill.sewer_fixed) * share * gross) : null,
      refuse: bill && share !== null ? r2(bill.refuse * share * gross) : null,
    };
  }).sort((a, b) => (Number(a.code) || 99) - (Number(b.code) || 99));
  const metered = meters.filter((m) => m.type === "water" && !m.is_main && m.calc.usage !== null).reduce((s, m) => s + m.calc.usage, 0);
  const allocated = split.reduce((s, r) => s + (r.share || 0), 0);
  return {
    period, bill, split, basis: billing.utility_split, denominator: city.denominator, letArea: city.letArea,
    buildingArea: num(billing.building_area_m2), companyShare: r2(1 - allocated), vatGross: gross,
    meteredKl: Math.round(metered * 1000) / 1000,
  };
}

export async function saveCityBill(period, body, user) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) throw new Error("Choose the invoice month");
  const q = await db();
  const v = {};
  for (const k of CITY_NUM) {
    const raw = body[k];
    if (raw === "" || raw === null || raw === undefined) { v[k] = k === "water_kl" ? null : 0; continue; }
    const n = Number(String(raw).replace(/[\sR]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) throw new Error(`${k.replace("_", " ")} must be an amount`);
    v[k] = n;
  }
  if (body.bill_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.bill_date)) throw new Error("Bill date must be a date");
  await q`INSERT INTO city_bills (period, bill_date, account_no, water_fixed, sewer_fixed, refuse, water_kl, notes, updated_by, updated_at)
          VALUES (${period}, ${body.bill_date || null}, ${body.account_no || null}, ${v.water_fixed}, ${v.sewer_fixed}, ${v.refuse},
                  ${v.water_kl}, ${body.notes || null}, ${user || null}, now())
          ON CONFLICT (period) DO UPDATE SET bill_date = EXCLUDED.bill_date, account_no = EXCLUDED.account_no,
            water_fixed = EXCLUDED.water_fixed, sewer_fixed = EXCLUDED.sewer_fixed, refuse = EXCLUDED.refuse,
            water_kl = EXCLUDED.water_kl, notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  return getCityBill(period);
}
