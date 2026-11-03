// Users, invoices, credit notes and payments.
export const DEFAULT_BILLING = {
  company_name: "Westfleur Centre (Pty) Ltd",
  reg_no: "2019/339584/07",
  address: "25 Wesfleur Circle\nAvondale, Atlantis\n7349",
  email: "kirahmatthews@gmail.com",
  phone: "",
  bank_name: "First National Bank",
  account_name: "Westfleur Centre (Pty) Ltd",
  account_no: "63008524414",
  branch_code: "250655",
  vat_registered_from: "", // YYYY-MM-DD once registered; invoices issued from then add VAT
  vat_number: "",
  vat_rate: 0.15,
  due_days: 7,
  prefix: "INV",
  credit_prefix: "CN",
  utility_split: "let", // "let": divide by area actually let (as the leases say); "total": divide by building_area_m2
  building_area_m2: 1327,
  footer: "Rent is payable monthly in advance. Late payments bear interest at prime + 3% as set out in your lease.",
};

// Operating costs from the signed leases, and refuse amounts as on the Nov 2026 invoices.
const OPEX = [
  { tenant: "Something Meaty%", start: "2025-11-01", amount: 190, pct: 7 },
  { tenant: "Visfabriek%", start: "2025-11-01", amount: 389, pct: 7 },
  { tenant: "JVC J%", start: "2025-10-01", amount: 290, pct: 5 },
  { tenant: "Marebole%", start: "2026-06-01", amount: 315, pct: 7 },
  { tenant: "Kekkel%", start: "2027-02-01", amount: 318, pct: 7 },
];
const REFUSE = { 1: 63.37, 2: 53.03, 3: 129.75, 4: 20.68, 5: 22.35, 6: 21.01, 8: 29.69, 9: 5.67, 10: 33.35 };

export async function createBillingSchema(q) {
  await q`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'reader',
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`ALTER TABLE leases ADD COLUMN IF NOT EXISTS opex_amount NUMERIC(12,2)`;
  await q`ALTER TABLE leases ADD COLUMN IF NOT EXISTS opex_escalation_pct NUMERIC(6,3)`;
  await q`ALTER TABLE units ADD COLUMN IF NOT EXISTS refuse_monthly NUMERIC(12,2)`;
  await q`CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'invoice',
    number TEXT UNIQUE,
    tenant_id INT NOT NULL REFERENCES tenants(id),
    lease_id INT REFERENCES leases(id),
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    issue_date TEXT,
    due_date TEXT,
    vat_registered BOOLEAN NOT NULL DEFAULT false,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit_of INT REFERENCES invoices(id),
    notes TEXT,
    warnings JSONB NOT NULL DEFAULT '[]',
    created_by TEXT,
    issued_by TEXT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS invoice_lines (
    id SERIAL PRIMARY KEY,
    invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    sort INT NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL,
    quantity NUMERIC(14,4),
    unit TEXT,
    unit_price NUMERIC(14,4),
    amount NUMERIC(12,2) NOT NULL
  )`;
  await q`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id),
    paid_on TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reference TEXT,
    note TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS city_bills (
    period TEXT PRIMARY KEY,
    bill_date TEXT,
    account_no TEXT,
    water_fixed NUMERIC(12,2) NOT NULL DEFAULT 0,
    sewer_fixed NUMERIC(12,2) NOT NULL DEFAULT 0,
    refuse NUMERIC(12,2) NOT NULL DEFAULT 0,
    water_kl NUMERIC(12,3),
    notes TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // City meters on the centre's account that serve one tenant: recharged at the billed amount.
  await q`CREATE TABLE IF NOT EXISTS city_bill_items (
    id SERIAL PRIMARY KEY,
    period TEXT NOT NULL,
    unit_code TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'electricity',
    meter_no TEXT,
    usage NUMERIC(14,3),
    usage_unit TEXT,
    usage_period TEXT,
    amount NUMERIC(12,2) NOT NULL
  )`;
  await q`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 455`;
  await q`CREATE SEQUENCE IF NOT EXISTS credit_number_seq START 1`;
  await q`INSERT INTO settings (key, value) VALUES ('billing', ${JSON.stringify(DEFAULT_BILLING)}) ON CONFLICT (key) DO NOTHING`;

  await q`CREATE TABLE IF NOT EXISTS data_updates (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const [done] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'billing-opex-refuse'`;
  if (!done) {
    for (const o of OPEX) {
      await q`UPDATE leases SET opex_amount = ${o.amount}, opex_escalation_pct = ${o.pct}
              WHERE opex_amount IS NULL AND start_date = ${o.start}
                AND tenant_id IN (SELECT id FROM tenants WHERE trading_name ILIKE ${o.tenant})`;
    }
    for (const [code, amt] of Object.entries(REFUSE)) {
      await q`UPDATE units SET refuse_monthly = ${amt} WHERE code = ${code} AND refuse_monthly IS NULL`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('billing-opex-refuse') ON CONFLICT DO NOTHING`;
  }
  // City of Cape Town account 231703234, tax invoice 240010083074 dated 23 Oct 2026, recovered on November 2026 invoices.
  const [cb] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'city-bill-2026-11'`;
  if (!cb) {
    await q`INSERT INTO city_bills (period, bill_date, account_no, water_fixed, sewer_fixed, refuse, water_kl, notes, updated_by)
            VALUES ('2026-11', '2026-10-23', '231703234', 733.82, 527.47, 442.60, 110,
                    'Tax invoice 240010083074. Water/sewerage 19 Sep – 19 Oct 2026 (meters ZXM003 20mm R286.45 + R205.90, C-XJK3343 25mm R447.37 + R321.57). Refuse 2 x 240L bins, 2 Sep – 1 Oct.',
                    'loaded from City bill')
            ON CONFLICT (period) DO NOTHING`;
    await q`INSERT INTO data_updates (id) VALUES ('city-bill-2026-11') ON CONFLICT DO NOTHING`;
  }
  // City meter 74861 on the centre account is Visfabriek's (Shop 3) electricity: billed from the City bill.
  // Something Meaty (Shop 1) buys its own prepaid electricity, so its meter card is retired.
  const [e1] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'visfabriek-electricity-city-meter'`;
  if (!e1) {
    await q`UPDATE meters SET active = false, recharge = false, name = 'Shop 1 electricity (prepaid — tenant buys own, not recharged)'
            WHERE shop = '1' AND type = 'electricity'`;
    const [has] = await q`SELECT 1 AS x FROM city_bill_items WHERE period = '2026-11' AND meter_no = '74861'`;
    if (!has) {
      await q`INSERT INTO city_bill_items (period, unit_code, service, meter_no, usage, usage_unit, usage_period, amount)
              VALUES ('2026-11', '3', 'electricity', '74861', 9853, 'kWh', '16 Sep – 15 Oct 2026', 33177.91)`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('visfabriek-electricity-city-meter') ON CONFLICT DO NOTHING`;
  }
  // Unit areas implied by the refuse/sewerage split on the Nov 2026 invoices, where no lease gives one.
  const [areas] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'unit-areas-from-invoices'`;
  if (!areas) {
    for (const [code, a] of [["4", 62], ["8", 89], ["9", 17], ["10", 100]]) {
      await q`UPDATE units SET area_m2 = ${a} WHERE code = ${code} AND area_m2 IS NULL`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('unit-areas-from-invoices') ON CONFLICT DO NOTHING`;
  }
}
