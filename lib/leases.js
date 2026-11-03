// Pure lease calculations. Dates are ISO strings "YYYY-MM-DD"; escalation_pct is a percentage (7 = 7%).

export const todayIso = () => new Date().toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const pad = (n) => String(n).padStart(2, "0");

function isoFor(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

const MON = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const za = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MON[m]} ${y}`; };

export const STATUSES = {
  signed: "Signed",
  unsigned: "Not signed",
  none: "No lease",
  renewal: "Renewal (future)",
  ended: "Ended",
};

// The day each year the rent goes up: explicit month/day, else the lease start anniversary.
export function escalationAnchor(l) {
  if (l.escalation_month) return { m: Number(l.escalation_month), d: Number(l.escalation_day) || 1 };
  if (l.start_date) {
    const [, m, d] = l.start_date.split("-").map(Number);
    return { m, d };
  }
  return null;
}

// Anniversary dates in (fromExcl, toIncl], never on or before the lease start.
export function anniversaries(anchor, fromExcl, toIncl, notOnOrBefore) {
  if (!anchor || !fromExcl || !toIncl || toIncl <= fromExcl) return [];
  const out = [];
  for (let y = Number(fromExcl.slice(0, 4)); y <= Number(toIncl.slice(0, 4)); y++) {
    const d = isoFor(y, anchor.m, anchor.d);
    if (d > fromExcl && d <= toIncl && (!notOnOrBefore || d > notOnOrBefore)) out.push(d);
  }
  return out;
}

export function compound(amount, pct, steps) {
  let a = Number(amount);
  for (let i = 0; i < steps; i++) a = r2(a * (1 + pct / 100));
  return r2(a);
}

export function isCurrent(l, t = todayIso()) {
  if (l.status === "ended") return false;
  if (l.status === "renewal") return !!l.start_date && l.start_date <= t;
  return !l.start_date || l.start_date <= t;
}

export function leaseState(l, t = todayIso()) {
  const pct = l.escalation_pct === null || l.escalation_pct === undefined ? null : Number(l.escalation_pct);
  const rent = l.current_rent === null || l.current_rent === undefined ? null : Number(l.current_rent);
  const anchor = escalationAnchor(l);
  const current = isCurrent(l, t);
  const holdover = current && l.status === "signed" && !!l.end_date && l.end_date < t;
  const daysToEnd = l.end_date ? daysBetween(t, l.end_date) : null;

  // Escalations that should have happened since the current rent took effect.
  const missed = current && anchor && pct && rent !== null && l.rent_from
    ? anniversaries(anchor, l.rent_from, t, l.start_date)
    : [];
  const expectedRent = rent === null ? null : compound(rent, pct || 0, missed.length);

  // Estimated under-billing: each month since the first missed increase, expected minus billed.
  let underbilled = 0;
  if (missed.length) {
    let [y, m] = missed[0].split("-").map(Number);
    const [ty, tm] = t.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const monthEnd = isoFor(y, m, 31);
      const steps = missed.filter((d) => d <= monthEnd).length;
      underbilled += compound(rent, pct, steps) - rent;
      m++;
      if (m > 12) { m = 1; y++; }
    }
    underbilled = r2(underbilled);
  }

  const searchFrom = l.rent_from && l.rent_from > t ? l.rent_from : t;
  const upcoming = anchor ? anniversaries(anchor, searchFrom, isoFor(Number(searchFrom.slice(0, 4)) + 2, 12, 31), l.start_date) : [];
  const nextDate = upcoming[0] || null;
  const nextAmount = nextDate && pct && expectedRent !== null ? compound(expectedRent, pct, 1) : null;
  const nextAfterEnd = !!(nextDate && l.end_date && nextDate > l.end_date && !holdover);

  // Year-by-year schedule from the current rent to the end of the lease (or 5 years).
  const schedule = [];
  if (rent !== null && l.rent_from) {
    const horizon = l.end_date && !holdover ? l.end_date : isoFor(Number(t.slice(0, 4)) + 5, 12, 31);
    const steps = anchor && pct ? anniversaries(anchor, l.rent_from, horizon, l.start_date) : [];
    const starts = [l.rent_from, ...steps];
    starts.forEach((from, i) => {
      const next = starts[i + 1];
      const to = next ? new Date(Date.parse(next) - 86400000).toISOString().slice(0, 10) : horizon;
      schedule.push({ from, to, amount: compound(rent, pct || 0, i), missed: i > 0 && from <= t && current });
    });
  }

  const alerts = [];
  const add = (level, text) => alerts.push({ level, text });
  if (current) {
    if (l.status === "none") add("high", "No lease in place");
    if (l.status === "unsigned") add("medium", "Lease not signed");
    if (l.status === "renewal") add("medium", "Renewal start date has passed — mark it signed or ended");
    if (holdover) add("high", `Lease expired ${za(l.end_date)} — tenant in holdover`);
    else if (daysToEnd !== null && daysToEnd >= 0 && daysToEnd <= 180) {
      add(daysToEnd <= 90 ? "high" : "medium", `Lease ends ${za(l.end_date)} (${daysToEnd} days)`);
    }
    if (missed.length) {
      add("high", `Increase not applied since ${za(missed[0])}: rent should be R${fmt(expectedRent)}, about R${fmt(underbilled)} under-billed so far`);
    }
    if (nextDate && !missed.length && daysBetween(t, nextDate) <= 60 && !nextAfterEnd) {
      add("medium", `Increase due ${za(nextDate)}: R${fmt(expectedRent)} → R${fmt(nextAmount)}`);
    }
    if (pct && !anchor) add("medium", "Increase date not recorded");
    if (pct === null && l.status !== "none") add("info", "Escalation rate not recorded");
    if (!l.rent_from && rent !== null) add("info", "Date the current rent started not recorded");
    const req = l.deposit_required === null ? null : Number(l.deposit_required);
    const held = l.deposit_held === null ? 0 : Number(l.deposit_held);
    if (req && held < req) add("medium", `Deposit short: R${fmt(held)} held of R${fmt(req)}`);
    if (l.notice_by) {
      const dn = daysBetween(t, l.notice_by);
      if (dn >= 0 && dn <= 90) add("medium", `Renewal notice due by ${za(l.notice_by)} (${dn} days)`);
    }
  }

  return {
    current, holdover, daysToEnd, anchor, missed, expectedRent, underbilled,
    nextDate, nextAmount, nextAfterEnd, schedule, alerts,
    statusLabel: holdover ? "Holdover" : STATUSES[l.status] || l.status,
  };
}

export const fmt = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const LEVEL_ORDER = { high: 0, medium: 1, info: 2 };
