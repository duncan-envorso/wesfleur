// Expense categories with what SARS expects to see, for a company that owns let property and runs a gym.
// deductible: "yes" | "partly" | "no". docs = the evidence to keep (records kept for 5 years, TAA s29).
export const CATEGORIES = [
  { key: "municipal", label: "Municipal (City of Cape Town)", deductible: "yes", docs: "City tax invoice for the month + proof of payment", note: "Rates, water, electricity, refuse. Recoveries billed to tenants are income." },
  { key: "bond_interest", label: "Bond interest (Business Partners)", deductible: "yes", docs: "Lender statement showing the interest for the period", note: "Only the interest is deductible." },
  { key: "bond_capital", label: "Bond capital repayment", deductible: "no", docs: "Lender statement", note: "Capital repayments reduce the loan — not an expense." },
  { key: "repairs", label: "Repairs & maintenance", deductible: "yes", docs: "Supplier tax invoice + proof of payment; photos before/after", note: "Repairs are deductible; improvements and new assets are capital (wear-and-tear allowance instead)." },
  { key: "capital", label: "Improvements / equipment (capital)", deductible: "partly", docs: "Tax invoice, proof of payment, asset register entry", note: "Not deductible at once; claim wear and tear over the asset's life." },
  { key: "insurance", label: "Insurance", deductible: "yes", docs: "Policy schedule + debit order proof", note: "Building and business cover. Personal policies are not deductible." },
  { key: "security", label: "Security", deductible: "yes", docs: "Supplier tax invoice + proof of payment", note: "" },
  { key: "cleaning", label: "Cleaning & garden", deductible: "yes", docs: "Invoice or signed receipt + proof of payment", note: "" },
  { key: "wages", label: "Salaries & wages (gym staff)", deductible: "yes", docs: "Payslips, EMP201 returns, IRP5s, UIF declarations", note: "Only deductible with PAYE/UIF properly withheld and paid — currently a known gap." },
  { key: "director", label: "Director's remuneration", deductible: "partly", docs: "Board resolution, payslip, PAYE (EMP201), IRP5", note: "Irregular transfers without payroll are treated as loan account or dividends, not salary." },
  { key: "professional", label: "Professional fees (accounting, legal, tax)", deductible: "yes", docs: "Tax invoice + proof of payment + engagement letter", note: "Fees on buying property are capital." },
  { key: "bank", label: "Bank charges", deductible: "yes", docs: "Bank statement", note: "" },
  { key: "vehicle", label: "Vehicle running costs", deductible: "partly", docs: "Fuel slips, service invoices, logbook of business km", note: "Only the business share, proven by a logbook; private use is a fringe benefit." },
  { key: "vehicle_finance", label: "Vehicle finance (Kempston)", deductible: "partly", docs: "Finance agreement + statement", note: "Only the interest portion, and only for business use." },
  { key: "gym", label: "Gym running costs & equipment", deductible: "yes", docs: "Supplier tax invoice + proof of payment", note: "Equipment over R7,000 per item is capital (wear and tear)." },
  { key: "software", label: "Software & subscriptions", deductible: "yes", docs: "Invoice or receipt + card/bank statement", note: "" },
  { key: "personal", label: "Personal / non-business", deductible: "no", docs: "Bank statement", note: "Not deductible — book to the director's loan account." },
  { key: "other", label: "Other", deductible: "partly", docs: "Tax invoice or receipt + proof of payment", note: "Describe the business purpose." },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
