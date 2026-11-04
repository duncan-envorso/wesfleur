import { db, getTariffs } from "./db";
import { DEFAULT_BILLING } from "./billing-schema";
import { calculate } from "./calc";
import { anniversaries, compound, fmt as fmtLease, isCurrent, leaseState, todayIso } from "./leases";

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
  // City meters on the centre account that serve only this unit (e.g. Visfabriek's electricity, meter 74861).
  for (const it of (city?.items || []).filter((i) => !i.shared && unit && i.unit_code === unit.code)) {
    const gross = vat ? 1 : 1 + (tariffs.add_vat ? tariffs.vat_rate : 0);
    const what = it.service === "electricity" ? "Electricity" : it.service.charAt(0).toUpperCase() + it.service.slice(1);
    const usage = it.usage ? `, ${Number(it.usage).toLocaleString("en-ZA")} ${it.usage_unit || ""}`.trimEnd() : "";
    lines.push({ kind: it.service, description: `${what} – City meter ${it.meter_no || ""}${usage}${it.usage_period ? ` (${it.usage_period})` : ""}, at City cost incl. service charges`,
      quantity: it.usage, unit: it.usage_unit, unit_price: null, amount: r2(it.amount * gross) });
  }

  const gross = vat ? 1 : 1 + (tariffs.add_vat ? tariffs.vat_rate : 0); // City amounts are excl. VAT
  const group = (city?.shared || []).find((g) => g.members.some((m) => m.tenant_id === lease.tenant_id));

  // A City meter shared by a group of tenants: this tenant's area over the group's area.
  if (group) {
    const me = group.members.find((m) => m.tenant_id === lease.tenant_id);
    if (!group.item) warnings.push(`No amount entered for shared City meter ${group.meter_no} for ${label} — ${group.service} not charged.`);
    else if (group.missing.length) warnings.push(`Shared City meter ${group.meter_no} not split: no floor area for ${group.missing.join(", ")}. Add the unit and area first.`);
    else {
      const share = me.area / group.area;
      const it = group.item;
      const use = it.usage !== null ? `${Number(it.usage).toLocaleString("en-ZA")} ${it.usage_unit || "kL"}` : "";
      lines.push({ kind: "water", description: `${group.service === "water" ? "Water & sewerage" : group.service} – shared City meter ${group.meter_no}${use ? `, ${use}` : ""}${it.usage_period ? ` (${it.usage_period})` : ""}, incl. fixed charges – ${(share * 100).toFixed(2)}% share (${me.area} m² of ${group.area} m²)`,
        quantity: null, unit: null, unit_price: null, amount: r2(it.amount * share * gross) });
    }
  }

  // Shared City charges split by floor area: fixed water/sewerage connection charges and refuse.
  if (city?.bill) {
    const area = num(unit?.area_m2);
    if (!area) warnings.push(`${unitName} has no floor area recorded — fixed charges and refuse not split. Add it under Settings → Units.`);
    else if (!city.denominator) warnings.push("No area to split the City bill over — check Settings → Invoices.");
    else {
      const share = area / city.denominator;
      const pct = `${(share * 100).toFixed(2)}%`;
      if (!group && city.fixedDenominator) {
        const fshare = area / city.fixedDenominator;
        const fixed = (num(city.bill.water_fixed) + num(city.bill.sewer_fixed)) * fshare * gross;
        if (fixed > 0) lines.push({ kind: "fixed", description: `Fixed water & sewerage charges – ${(fshare * 100).toFixed(2)}% of City basic charges (${area} m² of ${city.fixedDenominator} m²)`,
          quantity: null, unit: null, unit_price: null, amount: r2(fixed) });
      }
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
  const items = (await q`SELECT * FROM city_bill_items WHERE period = ${period} ORDER BY id`)
    .map((i) => ({ ...i, amount: Number(i.amount), usage: num(i.usage) }));
  const monthStart = `${period}-01`;
  const currentLeases = leases.filter((l) => isCurrent(l, monthStart));
  const letUnits = new Set(currentLeases.filter((l) => l.unit_id).map((l) => l.unit_id));
  const areaOf = (unitId) => num(units.find((u) => u.id === unitId)?.area_m2) || 0;
  const letArea = [...letUnits].reduce((s, id) => s + areaOf(id), 0);
  const denominator = billing.utility_split === "total" ? num(billing.building_area_m2) : letArea;

  // Shared City meters: each member's share is its unit area over the group's total area.
  const sharedRows = await q`SELECT m.meter_no, m.service, m.description, mm.tenant_id, t.trading_name
                             FROM city_shared_meters m JOIN city_shared_meter_members mm ON mm.meter_no = m.meter_no
                             JOIN tenants t ON t.id = mm.tenant_id WHERE m.active ORDER BY m.meter_no, t.trading_name`;
  const shared = new Map();
  for (const r of sharedRows) {
    if (!shared.has(r.meter_no)) shared.set(r.meter_no, { meter_no: r.meter_no, service: r.service, description: r.description, members: [] });
    const lease = [...currentLeases].reverse().find((l) => l.tenant_id === r.tenant_id);
    const unit = lease ? units.find((u) => u.id === lease.unit_id) : null;
    shared.get(r.meter_no).members.push({ tenant_id: r.tenant_id, trading_name: r.trading_name, unit: unit?.name || null,
      unit_id: unit?.id || null, area: unit ? num(unit.area_m2) : null, current: !!lease });
  }
  for (const g of shared.values()) {
    g.members = g.members.filter((m) => m.current);
    g.missing = g.members.filter((m) => !m.area).map((m) => m.trading_name);
    g.area = g.members.reduce((s, m) => s + (m.area || 0), 0);
    g.item = items.find((i) => i.shared && i.meter_no === g.meter_no) || null;
  }
  // Tenants on a shared meter don't also pay the other connection's fixed charges.
  const sharedUnitIds = new Set([...shared.values()].flatMap((g) => g.members.map((m) => m.unit_id)).filter(Boolean));
  const fixedArea = [...letUnits].filter((id) => !sharedUnitIds.has(id)).reduce((s, id) => s + areaOf(id), 0);
  const fixedDenominator = billing.utility_split === "total" ? num(billing.building_area_m2) : fixedArea;
  return { q, meters: report.meters, tariffs, billing, leases, units,
    city: { bill: bill || null, denominator, letArea, fixedDenominator, fixedArea, items, shared: [...shared.values()] } };
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
  const period = /^\d{4}-\d{2}$/.test(body.period || "") ? body.period : body.paid_on.slice(0, 7);
  await q`INSERT INTO payments (tenant_id, paid_on, amount, reference, note, created_by, period)
          VALUES (${Number(body.tenant_id)}, ${body.paid_on}, ${r2(amount)}, ${body.reference || null}, ${body.note || null}, ${user || null}, ${period})`;
}

export async function listPayments(tenantId, period) {
  const q = await db();
  if (period) return q`SELECT p.*, p.amount::float AS amount, t.trading_name FROM payments p JOIN tenants t ON t.id = p.tenant_id WHERE COALESCE(p.period, substr(p.paid_on, 1, 7)) = ${period} ORDER BY paid_on DESC, id DESC`;
  return tenantId
    ? q`SELECT p.*, p.amount::float AS amount, t.trading_name FROM payments p JOIN tenants t ON t.id = p.tenant_id WHERE p.tenant_id = ${Number(tenantId)} ORDER BY paid_on DESC, id DESC`
    : q`SELECT p.*, p.amount::float AS amount, t.trading_name FROM payments p JOIN tenants t ON t.id = p.tenant_id ORDER BY paid_on DESC, id DESC LIMIT 100`;
}

export async function deletePayment(id) {
  const q = await db();
  await q`DELETE FROM payments WHERE id = ${Number(id)}`;
}

// ---- City bill ----
const CITY_NUM = ["water_fixed", "sewer_fixed", "refuse", "water_kl", "rates", "water_use", "sewer_use",
  "bulk_elec", "bulk_elec_fixed", "bulk_elec_kwh", "other_charges"];
const toNum = (raw) => Number(String(raw ?? "").replace(/[\sR]/g, "").replace(/,(?=\d{1,3}$)/, ".").replace(/,/g, ""));

// The whole City account for the month against what the centre recovers: invoice lines (drafts and
// issued, net of credit notes) and the Citiq prepaid payout. Amounts include VAT while not registered.
async function recovery(q, period, bill, items, prepaid, gross, currentUnits) {
  const lines = await q`SELECT l.kind, sum(l.amount)::float AS amount FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
                        WHERE i.period = ${period} AND i.status IN ('issued', 'draft') GROUP BY l.kind`;
  const billed = (...kinds) => r2(lines.filter((l) => kinds.includes(l.kind)).reduce((s, l) => s + l.amount, 0));
  const n = (k) => Number(bill?.[k] || 0);
  const tenantElec = items.filter((i) => !i.shared && i.service === "electricity").reduce((s, i) => s + i.amount, 0);
  const sharedWater = items.filter((i) => i.shared || i.service === "water").reduce((s, i) => s + i.amount, 0);
  const pre = {
    kwh: r2(prepaid.reduce((s, p) => s + (num(p.kwh) || 0), 0)),
    tokens: r2(prepaid.reduce((s, p) => s + Number(p.tokens), 0)),
    recovery: r2(prepaid.reduce((s, p) => s + Number(p.recovery), 0)),
  };
  const rows = [
    { key: "rates", label: "Property rates", cost: r2(n("rates")), recovered: billed("rates"),
      how: "Not recharged — covered by rent. Newer leases allow a share of increases only." },
    { key: "tenant_elec", label: "Electricity — tenant meters on the City account", cost: r2(tenantElec * gross), recovered: billed("electricity"),
      how: "Invoiced at City cost (e.g. Visfabriek, meter 74861)." },
    { key: "bulk_elec", label: "Electricity — bulk supply to prepaid sub-meters", cost: r2(n("bulk_elec") * gross), recovered: pre.recovery,
      how: "Tenants buy Citiq tokens; Citiq pays the owner tokens less fees." },
    { key: "water", label: "Water & sewerage (use and fixed charges)", cost: r2((n("water_use") + n("sewer_use") + n("water_fixed") + n("sewer_fixed") + sharedWater) * gross),
      recovered: billed("water", "sewerage", "fixed"), how: "Tenant meters, shared meter split and fixed charges by area." },
    { key: "refuse", label: "Refuse", cost: r2(n("refuse") * gross), recovered: billed("refuse"), how: "Split by let area." },
    { key: "other", label: "Other City charges (late-payment / dunning)", cost: r2(n("other_charges") * gross), recovered: 0,
      how: "Avoidable — pay by the due date. Not recoverable." },
  ].map((r) => ({ ...r, gap: r2(r.recovered - r.cost) }));
  const tot = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  const flags = [];
  const kwh = n("bulk_elec_kwh");
  let energyRate = null, breakEven = null, unmeteredKwh = null;
  if (bill?.bulk_elec && kwh) {
    energyRate = (n("bulk_elec") - n("bulk_elec_fixed")) / kwh * gross;
    unmeteredKwh = r2(kwh - pre.kwh);
    if (unmeteredKwh > 0.5) flags.push(`${Math.round(unmeteredKwh).toLocaleString("en-US")} kWh of bulk electricity isn't on any prepaid sub-meter (≈ ${fmt(unmeteredKwh * energyRate)}) — gym, common lighting or a vacant unit?`);
    if (n("bulk_elec_fixed")) flags.push(`The City's service & wires charge on the bulk supply (${fmt(n("bulk_elec_fixed") * gross)}) isn't covered by prepaid tokens.`);
  }
  if (pre.kwh && pre.tokens) {
    const net = pre.recovery / pre.kwh;
    const keep = pre.recovery / pre.tokens;
    if (energyRate) {
      breakEven = energyRate / keep;
      if (net < energyRate - 0.005) flags.push(`Prepaid recovers ${fmt(net)}/kWh after Citiq fees (tenants pay ${fmt(pre.tokens / pre.kwh)}) against the City's ${fmt(energyRate)}/kWh — raise the Citiq tariff to at least ${fmt(breakEven)}/kWh.`);
    }
    flags.push(`Citiq fees took ${((1 - keep) * 100).toFixed(1)}% of the ${fmt(pre.tokens)} tenants paid.`);
  }
  for (const p of prepaid) {
    const occupied = currentUnits.has(String(p.unit_code));
    const where = p.unit_name || (p.unit_code ? `Unit ${p.unit_code}` : `meter ${p.meter_no}`);
    if (!p.unit_code) flags.push(`Prepaid meter ${p.meter_no} (${p.label || "no label"}) isn't linked to a unit.`);
    else if (!occupied && Number(p.kwh) > 0) flags.push(`${where} is vacant but ${Number(p.kwh)} kWh was bought on its prepaid meter ${p.meter_no} — who is using it?`);
    else if (occupied && !Number(p.kwh)) flags.push(`${where} (${p.tenant || "let"}) bought no prepaid electricity — check earlier months for a bypass or another supply.`);
  }
  return { rows, total: { cost: tot("cost"), recovered: tot("recovered"), gap: tot("gap") }, prepaid: pre,
    energyRate: energyRate && r2(energyRate), breakEven: breakEven && r2(breakEven), unmeteredKwh, flags };
}
const fmt = (n) => `R${fmtLease(n)}`;

export async function getCityBill(period) {
  const ctx = await context(period);
  const { q, units, leases, city, billing, meters, tariffs } = ctx;
  const monthStart = `${period}-01`;
  const current = new Map();
  for (const l of leases) if (isCurrent(l, monthStart) && l.unit_id) current.set(l.unit_id, l);
  const bill = city.bill ? Object.fromEntries(Object.entries(city.bill).map(([k, v]) => [k, CITY_NUM.includes(k) && v !== null ? Number(v) : v])) : null;
  const gross = 1 + (tariffs.add_vat ? tariffs.vat_rate : 0);
  const sharedUnits = new Set(city.shared.flatMap((g) => g.members.map((m) => m.unit_id)).filter(Boolean));
  const split = units.filter((u) => current.has(u.id)).map((u) => {
    const share = num(u.area_m2) && city.denominator ? num(u.area_m2) / city.denominator : null;
    const onShared = sharedUnits.has(u.id);
    const fshare = !onShared && num(u.area_m2) && city.fixedDenominator ? num(u.area_m2) / city.fixedDenominator : null;
    return {
      unit: u.name, code: u.code, tenant: current.get(u.id).trading_name, area: num(u.area_m2), share, fshare, onShared,
      fixed: bill && fshare !== null ? r2((bill.water_fixed + bill.sewer_fixed) * fshare * gross) : null,
      refuse: bill && share !== null ? r2(bill.refuse * share * gross) : null,
    };
  }).sort((a, b) => (Number(a.code) || 99) - (Number(b.code) || 99));
  // For a new month, offer last month's tenant meters with the amounts blank.
  let suggested = [];
  if (!city.items.length) {
    const [prev] = await q`SELECT max(period) AS p FROM city_bill_items WHERE period < ${period}`;
    if (prev?.p) suggested = (await q`SELECT unit_code, service, meter_no, usage_unit, shared FROM city_bill_items WHERE period = ${prev.p} ORDER BY id`)
      .map((i) => ({ ...i, usage: "", usage_period: "", amount: "" }));
  }
  // Citiq prepaid statement rows; for a new month, offer the known meters blank.
  const unitName = (code) => units.find((u) => String(u.code) === String(code))?.name || null;
  const tenantOn = (code) => { const u = units.find((x) => String(x.code) === String(code)); return u && current.get(u.id)?.trading_name; };
  let prepaid = (await q`SELECT * FROM city_prepaid WHERE period = ${period} ORDER BY id`)
    .map((p) => ({ ...p, kwh: num(p.kwh), tokens: Number(p.tokens), recovery: Number(p.recovery) }));
  const prepaidSuggested = prepaid.length ? [] : (await q`SELECT meter_no, label, unit_code FROM prepaid_meters WHERE active ORDER BY label, meter_no`)
    .map((m) => ({ ...m, kwh: "", tokens: "", recovery: "", statement_period: "" }));
  prepaid = prepaid.map((p) => ({ ...p, unit_name: unitName(p.unit_code), tenant: tenantOn(p.unit_code) || null }));
  const currentUnits = new Set(units.filter((u) => current.has(u.id)).map((u) => String(u.code)));
  const rec = await recovery(q, period, bill, city.items, prepaid, gross, currentUnits);
  const metered = meters.filter((m) => m.type === "water" && !m.is_main && m.calc.usage !== null).reduce((s, m) => s + m.calc.usage, 0);
  const allocated = split.reduce((s, r) => s + (r.share || 0), 0);
  return {
    period, bill, items: city.items, suggested, units: units.map((u) => ({ code: u.code, name: u.name })).sort((a, b) => (Number(a.code) || 99) - (Number(b.code) || 99)),
    split, basis: billing.utility_split, fixedArea: city.fixedDenominator,
    shared: city.shared.map((g) => ({ ...g, split: g.members.map((m) => ({ ...m,
      share: g.missing.length || !g.area ? null : m.area / g.area,
      amount: g.item && !g.missing.length && g.area ? r2(g.item.amount * (m.area / g.area) * gross) : null })) })), denominator: city.denominator, letArea: city.letArea,
    buildingArea: num(billing.building_area_m2), companyShare: r2(1 - allocated), vatGross: gross,
    meteredKl: Math.round(metered * 1000) / 1000,
    prepaid, prepaidSuggested, recovery: rec,
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
  if (Array.isArray(body.prepaid)) {
    const rows = [];
    for (const p of body.prepaid) {
      const meter = String(p.meter_no || "").trim();
      if (!meter) continue;
      const [kwh, tokens, rec] = [p.kwh, p.tokens, p.recovery].map((x) => (x === "" || x === null || x === undefined ? 0 : toNum(x)));
      if (![kwh, tokens, rec].every(Number.isFinite)) throw new Error(`Prepaid meter ${meter}: kWh, tokens and recovery must be numbers`);
      rows.push({ meter, label: p.label || null, unit: p.unit_code ? String(p.unit_code) : null, kwh, tokens, rec, sp: p.statement_period || null });
    }
    await q`DELETE FROM city_prepaid WHERE period = ${period}`;
    for (const r of rows) {
      await q`INSERT INTO city_prepaid (period, meter_no, unit_code, label, kwh, tokens, recovery, statement_period)
              VALUES (${period}, ${r.meter}, ${r.unit}, ${r.label}, ${r.kwh}, ${r.tokens}, ${r.rec}, ${r.sp})`;
      await q`INSERT INTO prepaid_meters (meter_no, label, unit_code) VALUES (${r.meter}, ${r.label}, ${r.unit})
              ON CONFLICT (meter_no) DO UPDATE SET label = EXCLUDED.label, unit_code = EXCLUDED.unit_code, active = true`;
    }
  }
  if (body.bill_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.bill_date)) throw new Error("Bill date must be a date");
  await q`INSERT INTO city_bills (period, bill_date, account_no, water_fixed, sewer_fixed, refuse, water_kl, rates, water_use, sewer_use,
                                  bulk_elec, bulk_elec_fixed, bulk_elec_kwh, other_charges, notes, updated_by, updated_at)
          VALUES (${period}, ${body.bill_date || null}, ${body.account_no || null}, ${v.water_fixed}, ${v.sewer_fixed}, ${v.refuse},
                  ${v.water_kl}, ${v.rates}, ${v.water_use}, ${v.sewer_use}, ${v.bulk_elec}, ${v.bulk_elec_fixed}, ${v.bulk_elec_kwh},
                  ${v.other_charges}, ${body.notes || null}, ${user || null}, now())
          ON CONFLICT (period) DO UPDATE SET bill_date = EXCLUDED.bill_date, account_no = EXCLUDED.account_no,
            water_fixed = EXCLUDED.water_fixed, sewer_fixed = EXCLUDED.sewer_fixed, refuse = EXCLUDED.refuse,
            water_kl = EXCLUDED.water_kl, rates = EXCLUDED.rates, water_use = EXCLUDED.water_use, sewer_use = EXCLUDED.sewer_use,
            bulk_elec = EXCLUDED.bulk_elec, bulk_elec_fixed = EXCLUDED.bulk_elec_fixed, bulk_elec_kwh = EXCLUDED.bulk_elec_kwh,
            other_charges = EXCLUDED.other_charges, notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  if (Array.isArray(body.items)) {
    await q`DELETE FROM city_bill_items WHERE period = ${period}`;
    for (const it of body.items) {
      if (!it.unit_code && !it.shared) continue;
      const amt = Number(String(it.amount ?? "").replace(/[\sR]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, ""));
      if (!Number.isFinite(amt)) throw new Error(`Enter the amount for meter ${it.meter_no || ""}`);
      const use = it.usage === "" || it.usage === null || it.usage === undefined ? null : Number(String(it.usage).replace(/\s/g, "").replace(",", "."));
      await q`INSERT INTO city_bill_items (period, unit_code, service, meter_no, usage, usage_unit, usage_period, amount, shared)
              VALUES (${period}, ${it.shared ? null : String(it.unit_code)}, ${it.service || "electricity"}, ${it.meter_no || null}, ${use},
                      ${it.usage_unit || (it.service === "water" ? "kL" : "kWh")}, ${it.usage_period || null}, ${amt}, ${!!it.shared})`;
    }
  }
  return getCityBill(period);
}

// ---- Collections: what each tenant owes for a month ----
export async function collections(period) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) throw new Error("Choose a month");
  const q = await db();
  const monthStart = `${period}-01`;
  const leases = await q`SELECT l.*, t.trading_name, u.name AS unit_name, u.sort AS unit_sort FROM leases l
                         JOIN tenants t ON t.id = l.tenant_id LEFT JOIN units u ON u.id = l.unit_id ORDER BY l.id`;
  const current = new Map();
  for (const l of leases) if (isCurrent(l, monthStart)) current.set(l.tenant_id, l);
  const docs = await q`SELECT tenant_id, period, status, kind, number, total::float AS total FROM invoices WHERE status IN ('issued', 'draft')`;
  const pays = await q`SELECT tenant_id, period, paid_on, amount::float AS amount FROM payments`;
  const tenantIds = new Set([...current.keys(), ...docs.filter((d) => d.status === "issued").map((d) => d.tenant_id), ...pays.map((p) => p.tenant_id)]);
  const names = new Map((await q`SELECT id, trading_name FROM tenants`).map((t) => [t.id, t.trading_name]));
  const rows = [...tenantIds].map((id) => {
    const lease = current.get(id);
    const issued = docs.filter((d) => d.tenant_id === id && d.status === "issued");
    const bf = r2(issued.filter((d) => d.period < period).reduce((s, d) => s + d.total, 0)
      - pays.filter((p) => p.tenant_id === id && (p.period || p.paid_on.slice(0, 7)) < period).reduce((s, p) => s + p.amount, 0));
    const thisIssued = issued.filter((d) => d.period === period);
    const draft = docs.find((d) => d.tenant_id === id && d.status === "draft" && d.period === period && d.kind === "invoice");
    const invoiced = r2(thisIssued.length ? thisIssued.reduce((s, d) => s + d.total, 0) : draft ? draft.total : 0);
    const monthPays = pays.filter((p) => p.tenant_id === id && (p.period || p.paid_on.slice(0, 7)) === period);
    const paid = r2(monthPays.reduce((s, p) => s + p.amount, 0));
    const due = r2(bf + invoiced - paid);
    const status = !invoiced && !bf && !paid ? "nothing" : due <= 0.5 ? (due < -0.5 ? "overpaid" : "paid") : paid > 0 ? "part" : "unpaid";
    return {
      tenant_id: id, trading_name: names.get(id), unit_name: lease?.unit_name || null, unit_sort: lease?.unit_sort ?? 99,
      active: !!lease, bf, invoiced, invoiceState: thisIssued.length ? "issued" : draft ? "draft" : "none",
      numbers: thisIssued.map((d) => d.number).filter(Boolean), paid, due, status,
      last_paid: monthPays.map((p) => p.paid_on).sort().at(-1) || null,
    };
  }).filter((r) => r.active || Math.abs(r.due) > 0.5 || r.paid)
    .sort((a, b) => (a.unit_sort - b.unit_sort) || String(a.trading_name).localeCompare(b.trading_name));
  const sum = (k) => r2(rows.reduce((s, r) => s + r[k], 0));
  return { period, rows, totals: { bf: sum("bf"), invoiced: sum("invoiced"), paid: sum("paid"), due: sum("due"),
    outstanding: r2(rows.filter((r) => r.due > 0).reduce((s, r) => s + r.due, 0)),
    tenantsDue: rows.filter((r) => r.due > 0.5).length } };
}
