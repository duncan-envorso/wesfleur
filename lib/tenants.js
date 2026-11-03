import { db } from "./db";
import { LEVEL_ORDER, leaseState, todayIso } from "./leases";

const NUM = ["current_rent", "escalation_pct", "deposit_required", "deposit_held", "area_m2", "amount", "opex_amount", "opex_escalation_pct", "refuse_monthly"];
const INT = ["escalation_month", "escalation_day", "unit_id"];

function norm(row) {
  const o = { ...row };
  for (const k of NUM) if (k in o && o[k] !== null) o[k] = Number(o[k]);
  return o;
}

export const TENANT_FIELDS = ["trading_name", "legal_name", "reg_no", "vat_no", "contact_name", "email", "phone", "postal_address", "surety_name", "notes"];
export const LEASE_FIELDS = ["unit_id", "status", "start_date", "end_date", "escalation_pct", "escalation_month", "escalation_day",
  "deposit_required", "deposit_held", "deposit_date", "vat_basis", "renewal_option", "notice_by", "document_url", "notes",
  "opex_amount", "opex_escalation_pct"];
const STATUS_OK = ["signed", "unsigned", "none", "renewal", "ended"];

function clean(body, fields) {
  const out = {};
  for (const k of fields) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === "" || v === undefined) v = null;
    if (v !== null && (NUM.includes(k) || INT.includes(k))) {
      let s = String(v).replace(/[\sR]/g, "");
      s = s.includes(".") ? s.replace(/,/g, "") : s.replace(",", ".");
      v = Number(s);
      if (!Number.isFinite(v)) throw new Error(`${k.replace(/_/g, " ")} must be a number`);
      if (INT.includes(k)) v = Math.round(v);
    }
    if (k === "status" && !STATUS_OK.includes(v)) throw new Error("Unknown lease status");
    if (/_date$|_by$|_from$/.test(k) && v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${k.replace(/_/g, " ")} must be a date`);
    out[k] = v;
  }
  return out;
}

async function update(table, id, values) {
  const q = await db();
  const keys = Object.keys(values);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  await q.query(`UPDATE ${table} SET ${set} WHERE id = $${keys.length + 1}`, [...keys.map((k) => values[k]), Number(id)]);
}

function withState(l, t) {
  const lease = norm(l);
  return { ...lease, state: leaseState(lease, t) };
}

export async function listTenants(t = todayIso()) {
  const q = await db();
  const tenants = await q`SELECT * FROM tenants ORDER BY trading_name`;
  const leases = await q`SELECT l.*, u.code AS unit_code, u.name AS unit_name, u.sort AS unit_sort
                         FROM leases l LEFT JOIN units u ON u.id = l.unit_id ORDER BY l.start_date NULLS FIRST, l.id`;
  const units = (await q`SELECT * FROM units ORDER BY sort, id`).map(norm);

  const rows = tenants.map((ten) => {
    const ls = leases.filter((l) => l.tenant_id === ten.id).map((l) => withState(l, t));
    const current = ls.filter((l) => l.state.current);
    const lease = current[current.length - 1] || ls[ls.length - 1] || null;
    const renewal = ls.find((l) => l.status === "renewal" && !l.state.current) || null;
    const alerts = current.flatMap((l) => l.state.alerts).map((a) =>
      renewal && /^Lease (ends|expired)/.test(a.text) ? { ...a, text: a.text + " — renewal drafted, not signed" } : a);
    alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    return { ...ten, lease, renewal, active: current.length > 0, alerts };
  });
  rows.sort((a, b) => (b.active - a.active) || ((a.lease?.unit_sort ?? 99) - (b.lease?.unit_sort ?? 99)));

  const active = rows.filter((r) => r.active);
  const occupied = new Set(active.map((r) => r.lease?.unit_id).filter(Boolean));
  const monthly = active.reduce((s, r) => s + (r.lease?.current_rent || 0), 0);
  const expected = active.reduce((s, r) => s + (r.lease?.state.expectedRent ?? r.lease?.current_rent ?? 0), 0);
  return {
    today: t,
    tenants: rows,
    units: units.map((u) => ({ ...u, occupied: occupied.has(u.id) })),
    totals: {
      monthly: Math.round(monthly * 100) / 100,
      expected: Math.round(expected * 100) / 100,
      annual: Math.round(monthly * 12 * 100) / 100,
      activeTenants: active.length,
      occupiedUnits: occupied.size,
      units: units.length,
    },
  };
}

export async function getTenant(id, t = todayIso()) {
  const q = await db();
  const [tenant] = await q`SELECT * FROM tenants WHERE id = ${Number(id)}`;
  if (!tenant) return null;
  const leases = (await q`SELECT l.*, u.code AS unit_code, u.name AS unit_name FROM leases l
                          LEFT JOIN units u ON u.id = l.unit_id WHERE l.tenant_id = ${tenant.id}
                          ORDER BY l.start_date NULLS FIRST, l.id`).map((l) => withState(l, t));
  const ids = leases.map((l) => l.id);
  const history = ids.length
    ? (await q.query(`SELECT * FROM rent_history WHERE lease_id = ANY($1::int[]) ORDER BY effective_from NULLS FIRST, id`, [ids])).map(norm)
    : [];
  for (const l of leases) l.history = history.filter((h) => h.lease_id === l.id);
  const events = await q`SELECT * FROM tenant_events WHERE tenant_id = ${tenant.id} ORDER BY event_date DESC, id DESC`;
  const units = (await q`SELECT * FROM units ORDER BY sort, id`).map(norm);
  return { today: t, tenant, leases, events, units };
}

export async function createTenant(body) {
  const q = await db();
  const ten = clean(body.tenant || {}, TENANT_FIELDS);
  if (!ten.trading_name) throw new Error("Tenant name is required");
  const [row] = await q`INSERT INTO tenants (trading_name) VALUES (${ten.trading_name}) RETURNING id`;
  await update("tenants", row.id, ten);
  if (body.lease) await createLease({ ...body.lease, tenant_id: row.id });
  return row.id;
}

export const updateTenant = (id, body) => update("tenants", id, clean(body, TENANT_FIELDS));

export async function createLease(body) {
  const q = await db();
  const tenantId = Number(body.tenant_id);
  const values = clean(body, LEASE_FIELDS);
  const money = clean(body, ["current_rent"]).current_rent ?? null;
  const from = body.rent_from || values.start_date || null;
  const [row] = await q`INSERT INTO leases (tenant_id, status) VALUES (${tenantId}, ${values.status || "signed"}) RETURNING id`;
  await update("leases", row.id, { ...values, current_rent: money, rent_from: from });
  if (money !== null) {
    await q`INSERT INTO rent_history (lease_id, effective_from, amount, reason) VALUES (${row.id}, ${from}, ${money}, 'Lease created')`;
  }
  return row.id;
}

export const updateLease = (id, body) => update("leases", id, clean(body, LEASE_FIELDS));

// Records a rent change in the history and makes it the lease's current rent.
export async function changeRent(leaseId, { amount, effective_from, reason }) {
  const q = await db();
  const { amount: a } = clean({ amount }, ["amount"]);
  if (a === null || a === undefined) throw new Error("Enter the new rent");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_from || "")) throw new Error("Enter the date the new rent applies from");
  await q`INSERT INTO rent_history (lease_id, effective_from, amount, reason) VALUES (${Number(leaseId)}, ${effective_from}, ${a}, ${reason || "Rent change"})`;
  await q`UPDATE leases SET current_rent = ${a}, rent_from = ${effective_from} WHERE id = ${Number(leaseId)}`;
}

export async function addEvent(tenantId, { event_date, kind, text }) {
  const q = await db();
  if (!text) throw new Error("Write what happened");
  await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
          VALUES (${Number(tenantId)}, ${event_date || todayIso()}, ${kind || "Note"}, ${text})`;
}

export async function deleteEvent(id) {
  const q = await db();
  await q`DELETE FROM tenant_events WHERE id = ${Number(id)}`;
}

export async function updateUnit(id, body) {
  const v = clean(body, ["area_m2", "refuse_monthly"]);
  if ("name" in body && body.name) v.name = String(body.name);
  await update("units", id, v);
}
