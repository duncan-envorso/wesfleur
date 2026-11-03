// City of Cape Town 2026/27 commercial tariffs (from 1 July 2026, no water restrictions), excl. VAT.
export const DEFAULT_TARIFFS = {
  water_per_kl: 39.56,
  sewer_per_kl: 29.57,
  sewer_pct: 0.95, // commercial sewerage is billed on 95% of water used
  electricity_per_kwh: 2.9406,
  vat_rate: 0.15,
  add_vat: true, // the City's charges include VAT, so recover the VAT-inclusive cost
};

// Accepts "0247,5018", "247.5018", "0247 5018" etc. A single comma is treated as the decimal mark.
export function parseReading(input) {
  if (input === null || input === undefined) return NaN;
  let s = String(input).trim().replace(/\s+/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return s === "" ? NaN : Number(s);
}

const r2 = (n) => Math.round(n * 100) / 100;

export function calculate({ type, previous, current }, t = DEFAULT_TARIFFS) {
  if (previous === null || previous === undefined || current === null || current === undefined) {
    return { usage: null, lines: [], total: null, warning: previous == null ? "No previous reading" : null };
  }
  const usage = Math.round((Number(current) - Number(previous)) * 10000) / 10000;
  const vat = t.add_vat ? 1 + t.vat_rate : 1;
  let warning = null;
  if (usage < 0) warning = "Reading is lower than last month — check the photo or the meter has been replaced";
  const lines = [];
  if (type === "electricity") {
    lines.push({ label: "Electricity", qty: usage, unit: "kWh", rate: t.electricity_per_kwh, amount: r2(usage * t.electricity_per_kwh * vat) });
  } else {
    const sewerKl = usage * t.sewer_pct;
    lines.push({ label: "Water", qty: usage, unit: "kL", rate: t.water_per_kl, amount: r2(usage * t.water_per_kl * vat) });
    lines.push({ label: "Sewerage", qty: Math.round(sewerKl * 10000) / 10000, unit: "kL", rate: t.sewer_per_kl, amount: r2(sewerKl * t.sewer_per_kl * vat) });
  }
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  return { usage, lines, total, warning };
}

export function prevPeriod(period) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export const money = (n) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : "R" + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Typical monthly ceilings: above these a reading is almost certainly a typo.
export const MAX_USAGE = { water: 150, electricity: 30000 };

const nf = (n, d = 4) => Number(n).toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d });

// If digits were typed without the comma, find where the comma most likely belongs:
// the placement that gives a plausible usage since the previous reading.
export function suggestReading(input, previous, type = "water") {
  const digits = String(input ?? "").replace(/\s/g, "");
  if (!/^\d{5,}$/.test(digits) || previous === null || previous === undefined) return null;
  const max = MAX_USAGE[type] ?? MAX_USAGE.water;
  let best = null;
  for (let i = 1; i < digits.length; i++) {
    const s = `${digits.slice(0, i)},${digits.slice(i)}`;
    const used = parseReading(s) - previous;
    if (used >= 0 && used <= max && (!best || used < best.used)) best = { s, used };
  }
  return best ? best.s.replace(/^0+(?=\d)/, "") : null;
}

// Returns null if the reading looks fine, otherwise { error, suggestion }.
export function checkReading({ type = "water", input, reading, previous, previousPeriod, next, nextPeriod }) {
  const unit = type === "electricity" ? "kWh" : "kL";
  const max = MAX_USAGE[type] ?? MAX_USAGE.water;
  const suggestion = suggestReading(input, previous, type);
  const hint = suggestion ? ` Did you mean ${suggestion}?` : "";
  if (previous !== null && previous !== undefined) {
    const used = reading - previous;
    if (used < 0) return { error: `This is lower than ${previousPeriod}'s reading (${nf(previous)}).${hint}`, suggestion };
    if (used > max) return { error: `That would be ${nf(used, 1)} ${unit} used since ${previousPeriod} — far more than normal.${hint}`, suggestion };
  }
  if (next !== null && next !== undefined && reading > next) {
    return { error: `This is higher than the later ${nextPeriod} reading (${nf(next)}). Check both months.`, suggestion };
  }
  return null;
}
