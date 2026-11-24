// Shared by the browser and the server: kinds of boxes on a lease, and the tenant/lease data
// that template "data" boxes can be filled with.

export const ROLES = [
  { key: "tenant", label: "Tenant", color: "#2a5bb5" },
  { key: "landlord", label: "Landlord", color: "#b3541e" },
  { key: "surety", label: "Other signer", color: "#6b3fa0" },
];
export const roleColor = (role) => ROLES.find((r) => r.key === role)?.color || "#5d6a6b";

// Boxes a signer fills in.
export const SIGNER_KINDS = [
  { key: "signature", label: "Signature", w: 0.3, h: 0.055 },
  { key: "initials", label: "Initials", w: 0.09, h: 0.035 },
  { key: "date", label: "Date signed", w: 0.2, h: 0.025, auto: true },
  { key: "name", label: "Full name", w: 0.28, h: 0.025, auto: true },
  { key: "place", label: "Place (town)", w: 0.22, h: 0.025 },
  { key: "text", label: "Text they type", w: 0.28, h: 0.025 },
];
export const kindInfo = (k) => SIGNER_KINDS.find((x) => x.key === k) || (k === "data" ? { key: "data", label: "Lease data", w: 0.3, h: 0.025 } : { key: k, label: k });

// Data boxes: filled in when a lease is made from a template (editable before it's sent).
export const DATA_SOURCES = [
  { key: "tenant.legal_name", label: "Tenant: registered name" },
  { key: "tenant.trading_name", label: "Tenant: trading name" },
  { key: "tenant.reg_no", label: "Tenant: registration number" },
  { key: "tenant.vat_no", label: "Tenant: VAT number" },
  { key: "tenant.contact_name", label: "Tenant: contact / signatory" },
  { key: "tenant.email", label: "Tenant: email" },
  { key: "tenant.phone", label: "Tenant: phone" },
  { key: "tenant.postal_address", label: "Tenant: address (domicilium)" },
  { key: "tenant.surety_name", label: "Surety name" },
  { key: "unit.name", label: "Premises (e.g. Shop 2)" },
  { key: "unit.area_m2", label: "Premises area (m²)" },
  { key: "lease.start_date", label: "Lease start date" },
  { key: "lease.end_date", label: "Lease end date" },
  { key: "lease.term_years", label: "Lease term (years)" },
  { key: "lease.current_rent", label: "Monthly rent (R, excl. VAT)" },
  { key: "lease.rent_per_m2", label: "Rent per m² (R)" },
  { key: "lease.annual_rent", label: "Annual rent (R)" },
  { key: "lease.escalation_pct", label: "Escalation (%)" },
  { key: "lease.deposit_required", label: "Deposit (R)" },
  { key: "lease.opex_amount", label: "Operating costs per month (R)" },
  { key: "lease.notice_by", label: "Renewal notice by (date)" },
  { key: "landlord.name", label: "Landlord: Westfleur Centre (Pty) Ltd" },
  { key: "landlord.signatory", label: "Landlord: signatory (Kirah Matthews)" },
  { key: "today", label: "Today's date" },
  { key: "custom", label: "Other (type it in when making the lease)" },
];
export const dataLabel = (key) => DATA_SOURCES.find((d) => d.key === key)?.label || key;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
};
// Same style as the lease wording, e.g. R24,618.30
const rands = (n) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? "" : "R" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (n, d = 2) => (n === null || n === undefined || n === "" ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));

// Values for every data source from the tenant's records.
export function resolveData({ tenant = {}, lease = {}, unit = {} }, today = new Date().toISOString().slice(0, 10)) {
  const years = lease.start_date && lease.end_date
    ? Math.round(((Date.parse(lease.end_date) - Date.parse(lease.start_date)) / (365.25 * 86400000)) * 10) / 10
    : null;
  const area = unit.area_m2 ?? lease.area_m2 ?? null;
  return {
    "tenant.legal_name": tenant.legal_name || tenant.trading_name || "",
    "tenant.trading_name": tenant.trading_name || "",
    "tenant.reg_no": tenant.reg_no || "",
    "tenant.vat_no": tenant.vat_no || "",
    "tenant.contact_name": tenant.contact_name || "",
    "tenant.email": tenant.email || "",
    "tenant.phone": tenant.phone || "",
    "tenant.postal_address": tenant.postal_address || "",
    "tenant.surety_name": tenant.surety_name || "",
    "unit.name": unit.name || lease.unit_name || "",
    "unit.area_m2": area ? num(area) : "",
    "lease.start_date": longDate(lease.start_date),
    "lease.end_date": longDate(lease.end_date),
    "lease.term_years": years ? num(Math.round(years)) : "",
    "lease.current_rent": rands(lease.current_rent),
    "lease.rent_per_m2": area && lease.current_rent ? rands(Number(lease.current_rent) / Number(area)) : "",
    "lease.annual_rent": lease.current_rent ? rands(Number(lease.current_rent) * 12) : "",
    "lease.escalation_pct": lease.escalation_pct !== null && lease.escalation_pct !== undefined ? `${num(lease.escalation_pct)}%` : "",
    "lease.deposit_required": rands(lease.deposit_required),
    "lease.opex_amount": rands(lease.opex_amount),
    "lease.notice_by": longDate(lease.notice_by),
    "landlord.name": "Westfleur Centre (Pty) Ltd",
    "landlord.signatory": "Kirah Matthews",
    today: longDate(today),
    custom: "",
  };
}

// Keeps a box inside its page and at a usable size.
export function clampBox(f) {
  const w = Math.min(Math.max(f.w, 0.03), 1);
  const h = Math.min(Math.max(f.h, 0.015), 1);
  return { ...f, w, h, x: Math.min(Math.max(f.x, 0), 1 - w), y: Math.min(Math.max(f.y, 0), 1 - h) };
}

// Data boxes that say the same thing (e.g. the tenant's name in five places) are filled in once.
export const dataKey = (f) => (f.source === "custom" ? `custom:${(f.label || "Other").trim().toLowerCase()}` : f.source);

export const newFieldId = () => "f" + Math.random().toString(36).slice(2, 10);

// Validates boxes coming from the browser.
export function cleanFields(list, { pages, allowData = false, roles = ROLES.map((r) => r.key) } = {}) {
  if (!Array.isArray(list)) throw new Error("Boxes are invalid");
  if (list.length > 600) throw new Error("Too many boxes");
  const kinds = new Set([...SIGNER_KINDS.map((k) => k.key), ...(allowData ? ["data"] : [])]);
  return list.map((f) => {
    if (!kinds.has(f.kind)) throw new Error(`Unknown box type: ${f.kind}`);
    const page = Number(f.page);
    if (!Number.isInteger(page) || page < 0 || (pages && page >= pages)) throw new Error("A box is on a page that doesn't exist");
    const out = clampBox({
      id: String(f.id || newFieldId()).slice(0, 20),
      kind: f.kind, page,
      x: Number(f.x) || 0, y: Number(f.y) || 0, w: Number(f.w) || 0.2, h: Number(f.h) || 0.03,
      label: f.label ? String(f.label).slice(0, 80) : null,
      required: f.required !== false,
    });
    if (f.kind === "data") {
      out.source = DATA_SOURCES.some((d) => d.key === f.source) ? f.source : "custom";
      if (f.value !== undefined) out.value = String(f.value ?? "").slice(0, 300);
    } else {
      if (f.role !== undefined) {
        if (!roles.includes(f.role)) throw new Error("A box has no signer");
        out.role = f.role;
      }
      if (f.signer_id !== undefined) out.signer_id = Number(f.signer_id) || null;
    }
    return out;
  });
}
