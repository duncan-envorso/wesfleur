import { db, getTariffs } from "./db";
import { calculate } from "./calc";

// For each active meter: this period's reading and the latest earlier reading.
export async function buildReport(period) {
  const q = await db();
  const tariffs = await getTariffs();
  const rows = await q`
    SELECT m.*,
      cur.id AS reading_id, cur.reading AS current, cur.read_on, cur.photo_url, cur.read_by, cur.note,
      prev.reading AS previous, prev.period AS previous_period, prev.photo_url AS previous_photo_url
    FROM meters m
    LEFT JOIN readings cur ON cur.meter_id = m.id AND cur.period = ${period}
    LEFT JOIN LATERAL (
      SELECT reading, period, photo_url FROM readings r
      WHERE r.meter_id = m.id AND r.period < ${period}
      ORDER BY r.period DESC LIMIT 1
    ) prev ON true
    WHERE m.active
    ORDER BY m.sort, m.id`;

  const meters = rows.map((r) => {
    const previous = r.previous === null ? null : Number(r.previous);
    const current = r.current === null ? null : Number(r.current);
    return { ...r, previous, current, calc: calculate({ type: r.type, previous, current }, tariffs) };
  });

  // Main-meter reconciliation: what the City meters measured vs the sum of the sub-meters.
  // A City meter listed as shared (e.g. C-XJK3343) feeds shops without sub-meters and is split by area,
  // so it is shown but left out of the comparison.
  const sharedNos = new Set((await q`SELECT meter_no FROM city_shared_meters`.catch(() => [])).map((r) => r.meter_no));
  const mains = meters.filter((m) => m.is_main && m.type === "water")
    .map((m) => ({ id: m.id, name: m.name, meter_no: m.meter_no, usage: m.calc.usage, shared: sharedNos.has(m.meter_no) }));
  const compared = mains.filter((m) => !m.shared);
  const subs = meters.filter((m) => !m.is_main && m.type === "water");
  let reconciliation = null;
  if (compared.length && compared.every((m) => m.usage !== null)) {
    const mainUsage = compared.reduce((s, m) => s + m.usage, 0);
    const subTotal = subs.reduce((s, m) => s + (m.calc.usage || 0), 0);
    const missing = subs.filter((m) => m.calc.usage === null).map((m) => m.name);
    const unaccounted = Math.round((mainUsage - subTotal) * 10000) / 10000;
    reconciliation = {
      mainUsage: Math.round(mainUsage * 10000) / 10000,
      subTotal: Math.round(subTotal * 10000) / 10000,
      unaccounted,
      unaccountedCost: calculate({ type: "water", previous: 0, current: unaccounted }, tariffs).total,
      missing,
    };
  }
  const recharge = meters.filter((m) => m.recharge && m.calc.total !== null);
  const rechargeTotal = Math.round(recharge.reduce((s, m) => s + m.calc.total, 0) * 100) / 100;
  return { period, tariffs, meters, mains, reconciliation, rechargeTotal };
}
