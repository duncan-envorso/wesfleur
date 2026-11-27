import { db, getTariffs } from "./db";
import { calculate } from "./calc";

const MONTH = /^\d{4}-\d{2}$/;
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// Water used per tenant, month by month, from the sub-meter readings. A month's usage is that
// month's reading less the meter's latest earlier reading (the same basis as the Meter report).
// Tenants are grouped by the name on the meter, so a tenant with more than one meter is added up.
// City main meters are left out; the gym and vacant shops are included but marked as not recharged.
export async function waterUsage(from, to) {
  if (!MONTH.test(from || "") || !MONTH.test(to || "")) throw new Error("from and to must be YYYY-MM");
  if (from > to) [from, to] = [to, from];
  const months = monthsBetween(from, to);
  if (months.length > 60) throw new Error("Pick a range of five years or less");

  const q = await db();
  const tariffs = await getTariffs();
  const rows = await q`
    SELECT * FROM (
      SELECT m.id AS meter_id, m.name, m.shop, m.tenant, m.recharge, m.sort,
        r.period, r.reading,
        LAG(r.reading) OVER (PARTITION BY r.meter_id ORDER BY r.period) AS previous
      FROM meters m JOIN readings r ON r.meter_id = m.id
      WHERE m.active AND m.type = 'water' AND NOT m.is_main AND r.period <= ${to}
    ) x
    WHERE x.period >= ${from}
    ORDER BY x.sort, x.meter_id, x.period`;
  const meters = await q`SELECT id, name, shop, tenant, recharge, sort FROM meters
                         WHERE active AND type = 'water' AND NOT is_main ORDER BY sort, id`;

  const tenants = new Map();
  for (const m of meters) {
    const key = (m.tenant || m.name || "").trim().toLowerCase() || `meter-${m.id}`;
    if (!tenants.has(key)) tenants.set(key, { tenant: m.tenant || m.name, meters: [], recharge: false, months: {}, missing: [], usage: 0, cost: 0, sort: m.sort });
    const t = tenants.get(key);
    t.meters.push({ id: m.id, name: m.name, shop: m.shop });
    t.recharge ||= m.recharge;
  }
  const keyOf = new Map(meters.map((m) => [m.id, (m.tenant || m.name || "").trim().toLowerCase() || `meter-${m.id}`]));

  const seen = new Set();
  for (const r of rows) {
    const t = tenants.get(keyOf.get(r.meter_id));
    if (!t || r.previous === null) continue;
    const c = calculate({ type: "water", previous: Number(r.previous), current: Number(r.reading) }, tariffs);
    if (c.usage === null || c.usage < 0) continue;
    seen.add(`${r.meter_id}|${r.period}`);
    t.months[r.period] = round((t.months[r.period] || 0) + c.usage, 4);
    t.usage += c.usage;
    t.cost += c.total || 0;
  }
  // Months with no usable reading (not read, first reading, or lower than the month before).
  for (const t of tenants.values()) {
    for (const p of months) if (t.meters.some((m) => !seen.has(`${m.id}|${p}`))) t.missing.push(p);
  }

  const list = [...tenants.values()].map((t) => ({ ...t, usage: round(t.usage, 4), cost: round(t.cost, 2) }));
  const totalUsage = list.reduce((s, t) => s + t.usage, 0);
  for (const t of list) t.share = totalUsage ? round(t.usage / totalUsage, 4) : 0;
  list.sort((a, b) => b.usage - a.usage || a.sort - b.sort);

  const byMonth = Object.fromEntries(months.map((p) => [p, round(list.reduce((s, t) => s + (t.months[p] || 0), 0), 4)]));
  return {
    from, to, months, tariffs, tenants: list, byMonth,
    totalUsage: round(totalUsage, 4),
    totalCost: round(list.reduce((s, t) => s + t.cost, 0), 2),
    rechargedUsage: round(list.filter((t) => t.recharge).reduce((s, t) => s + t.usage, 0), 4),
  };
}
