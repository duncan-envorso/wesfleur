// Income that doesn't come through tenant invoices. Rent and recoveries come from invoices.
export const INCOME_CATEGORIES = [
  { key: "gym_membership", label: "Gym memberships (EFT)", note: "Taxable supply once VAT-registered (15%)." },
  { key: "gym_cash", label: "Gym cash takings", note: "Keep daily cash-up sheets and deposit slips (e.g. Rebel Fitness deposits)." },
  { key: "consulting", label: "Consulting — Envorso LLC", note: "Export of services: zero-rated (0%) once VAT-registered, but counts toward the R2.3m threshold." },
  { key: "insurance_payout", label: "Insurance payouts", note: "Recoupment of wear and tear; any excess over cost is a capital gain." },
  { key: "asset_sale", label: "Sale of assets (e.g. vehicles)", note: "Recoupment / capital gain — not ordinary trading income. Sales to family must be at market value." },
  { key: "interest", label: "Interest received", note: "" },
  { key: "other", label: "Other income", note: "Describe what it was." },
];
export const INCOME_CATEGORY = Object.fromEntries(INCOME_CATEGORIES.map((c) => [c.key, c]));
// Income that belongs on the P&L as trading income vs. one-off capital items.
export const CAPITAL_INCOME = new Set(["insurance_payout", "asset_sale"]);
