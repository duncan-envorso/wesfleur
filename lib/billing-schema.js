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
  // A City meter shared by a group of tenants (split by their floor area), e.g. C-XJK3343.
  await q`CREATE TABLE IF NOT EXISTS city_shared_meters (
    meter_no TEXT PRIMARY KEY,
    service TEXT NOT NULL DEFAULT 'water',
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true
  )`;
  await q`CREATE TABLE IF NOT EXISTS city_shared_meter_members (
    meter_no TEXT NOT NULL REFERENCES city_shared_meters(meter_no) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (meter_no, tenant_id)
  )`;
  await q`ALTER TABLE city_bill_items ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false`;
  await q`ALTER TABLE city_bill_items ALTER COLUMN unit_code DROP NOT NULL`;
  // The rest of the City bill, so recoveries can be compared with the whole account (all excl VAT except rates).
  for (const col of ["rates", "water_use", "sewer_use", "bulk_elec", "bulk_elec_fixed", "bulk_elec_kwh", "other_charges"]) {
    await q.query(`ALTER TABLE city_bills ADD COLUMN IF NOT EXISTS ${col} NUMERIC(14,3)`);
  }
  // Prepaid (Citiq) sub-meters behind the City's bulk electricity meters. Citiq pays the owner the
  // tokens tenants buy, less its fees; each month's building statement is recorded per meter.
  await q`CREATE TABLE IF NOT EXISTS prepaid_meters (
    meter_no TEXT PRIMARY KEY,
    label TEXT,
    unit_code TEXT,
    active BOOLEAN NOT NULL DEFAULT true
  )`;
  await q`CREATE TABLE IF NOT EXISTS city_prepaid (
    id SERIAL PRIMARY KEY,
    period TEXT NOT NULL,
    meter_no TEXT NOT NULL,
    unit_code TEXT,
    label TEXT,
    kwh NUMERIC(14,3),
    tokens NUMERIC(12,2) NOT NULL DEFAULT 0,
    recovery NUMERIC(12,2) NOT NULL DEFAULT 0,
    statement_period TEXT
  )`;
  // Which month a payment is for (rent is paid in advance, so 30 Oct can pay November).
  await q`ALTER TABLE payments ADD COLUMN IF NOT EXISTS period TEXT`;
  await q`UPDATE payments SET period = CASE WHEN note ILIKE 'November 2026%' THEN '2026-11' ELSE substr(paid_on, 1, 7) END WHERE period IS NULL`;
  await q`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    spent_on TEXT NOT NULL,
    period TEXT NOT NULL,
    supplier TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12,2) NOT NULL,
    vat NUMERIC(12,2) NOT NULL DEFAULT 0,
    method TEXT,
    reference TEXT,
    unit_code TEXT,
    receipt_url TEXT,
    receipt_name TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS income (
    id SERIAL PRIMARY KEY,
    received_on TEXT NOT NULL,
    period TEXT NOT NULL,
    payer TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12,2) NOT NULL,
    method TEXT,
    reference TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
  // C-XJK3343 (25 mm) serves JVC, Marebole, SA Funerals and T Adams, who have no sub-meters of their own.
  // ZXM003's fixed charges then fall on the other shops only.
  const [sm] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'shared-meter-c-xjk3343'`;
  if (!sm) {
    await q`INSERT INTO city_shared_meters (meter_no, service, description)
            VALUES ('C-XJK3343', 'water', '25 mm water connection serving Shops 5, 6, 9 and T Adams') ON CONFLICT DO NOTHING`;
    for (const pat of ["JVC%", "Marebole%", "SA Funerals%", "T Adams%"]) {
      await q`INSERT INTO city_shared_meter_members (meter_no, tenant_id)
              SELECT 'C-XJK3343', id FROM tenants WHERE trading_name ILIKE ${pat} ON CONFLICT DO NOTHING`;
    }
    // These shops have no water sub-meters (old invoices charged a flat R84.39), so retire their reading cards.
    await q`UPDATE meters SET active = false, recharge = false WHERE type = 'water' AND shop IN ('5', '6', '9')`;
    // November bill: C-XJK3343 = 0 kL + fixed R447.37 water + R321.57 sewerage; fixed charges left on ZXM003 only.
    await q`UPDATE city_bills SET water_fixed = 286.45, sewer_fixed = 205.90
            WHERE period = '2026-11' AND water_fixed = 733.82 AND sewer_fixed = 527.47`;
    const [has] = await q`SELECT 1 AS x FROM city_bill_items WHERE period = '2026-11' AND meter_no = 'C-XJK3343'`;
    if (!has) {
      await q`INSERT INTO city_bill_items (period, unit_code, service, meter_no, usage, usage_unit, usage_period, amount, shared)
              VALUES ('2026-11', NULL, 'water', 'C-XJK3343', 0, 'kL', '19 Sep – 19 Oct 2026', 768.94, true)`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('shared-meter-c-xjk3343') ON CONFLICT DO NOTHING`;
  }
  // T Adams occupies 30 m² (Duncan, 3 Nov 2026) — recorded as Shop 7, the only unit without a tenant.
  const [ta] = await q`SELECT 1 AS x FROM data_updates WHERE id = 't-adams-shop-7'`;
  if (!ta) {
    await q`UPDATE units SET area_m2 = 30 WHERE code = '7' AND area_m2 IS NULL`;
    const [u7] = await q`SELECT id FROM units WHERE code = '7'`;
    const [t] = await q`SELECT id FROM tenants WHERE trading_name ILIKE 'T Adams%' ORDER BY id LIMIT 1`;
    if (u7 && t) {
      await q`UPDATE leases SET unit_id = ${u7.id} WHERE tenant_id = ${t.id} AND unit_id IS NULL AND status <> 'ended'`;
      await q`UPDATE meters SET tenant = 'T Adams', active = false, recharge = false WHERE shop = '7' AND type = 'water'`;
      await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
              VALUES (${t.id}, '2026-11-03', 'Note', 'Unit recorded as Shop 7, 30 m² (Duncan, 3 Nov 2026). Shares water meter C-XJK3343 with JVC, Marebole and SA Funerals.')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('t-adams-shop-7') ON CONFLICT DO NOTHING`;
  }
  // November 2026 rent received in advance (FNB 63008524414 statement to 3 Nov 2026).
  const [np] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'payments-2026-11-fnb'`;
  if (!np) {
    const pays = [
      ["Marebole%", "2026-10-30", 7922.52, "FNB 30 Oct 2026 — MAREBOLE WC OFFICE"],
      ["JVC J%", "2026-10-29", 7000.00, "FNB 29 Oct 2026 — FNB APP PAYMENT FROM JVC"],
      ["T Adams%", "2026-10-28", 3500.00, "FNB 28 Oct 2026 — CAPITEC T ADAMS"],
    ];
    for (const [pat, on, amt, ref] of pays) {
      const [t] = await q`SELECT id FROM tenants WHERE trading_name ILIKE ${pat} ORDER BY id LIMIT 1`;
      if (!t) continue;
      const [dup] = await q`SELECT 1 AS x FROM payments WHERE tenant_id = ${t.id} AND paid_on = ${on} AND amount = ${amt}`;
      if (!dup) await q`INSERT INTO payments (tenant_id, paid_on, amount, reference, note, created_by)
                        VALUES (${t.id}, ${on}, ${amt}, ${ref}, 'November 2026 rent, paid in advance', 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('payments-2026-11-fnb') ON CONFLICT DO NOTHING`;
  }
  // Expenses are recorded from November 2026 only (Duncan, 3 Nov 2026): remove the Sep/Oct Renasa
  // lines an earlier update may have added, and record November's gym wages from the FNB statement.
  const [en] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'expenses-november-2026'`;
  if (!en) {
    await q`DELETE FROM expenses WHERE created_by = 'bank statement import'
              AND reference IN ('ECIARENASADBNR000252 RF1UPR86', 'ECIARENASADBNR000252 RF1UZ8NZ')`;
    for (const ref of ["Salary- Gym (1 of 2)", "Salary- Gym (2 of 2)"]) {
      const [dup] = await q`SELECT 1 AS x FROM expenses WHERE reference = ${ref} AND spent_on = '2026-11-03'`;
      if (!dup) await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, notes, created_by)
                        VALUES ('2026-11-03', '2026-11', 'Gym staff', 'wages', 'Gym staff salary, November 2026', 6000, 0, 'EFT', ${ref},
                                'From FNB statement 63008524414. Keep payslips; PAYE/UIF still to be regularised.', 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('expenses-november-2026') ON CONFLICT DO NOTHING`;
  }
  // Old Mutual debit orders are personal policies (Duncan, 3 Nov 2026): recorded as personal, for the director's loan account.
  const [om] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'expenses-old-mutual-2026-11'`;
  if (!om) {
    for (const [amt, ref] of [[841.02, "OLD MUTUAL0000D4302C 261101"], [276.81, "OLD MUTUAL0000D43167 261101"]]) {
      const [dup] = await q`SELECT 1 AS x FROM expenses WHERE reference = ${ref}`;
      if (!dup) await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, notes, created_by)
                        VALUES ('2026-11-02', '2026-11', 'Old Mutual', 'personal', 'Personal insurance policy premium (debit order)', ${amt}, 0, 'Debit order', ${ref},
                                'Personal policy paid from the company account — book to the director''s loan account, not a company expense.', 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('expenses-old-mutual-2026-11') ON CONFLICT DO NOTHING`;
  }
  // "DIRECTOR SALARY" transfers are drawings on the director's loan account until payroll exists (Duncan, 3 Nov 2026).
  const [dl] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'expenses-director-loan-2026-11'`;
  if (!dl) {
    const [dup] = await q`SELECT 1 AS x FROM expenses WHERE reference = 'DIRECTOR SALARY 2026-11-02' AND spent_on = '2026-11-02'`;
    if (!dup) await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, notes, created_by)
                      VALUES ('2026-11-02', '2026-11', 'Director', 'director_loan', 'Transfer labelled DIRECTOR SALARY — no payroll/PAYE, so drawings', 1000, 0, 'EFT',
                              'DIRECTOR SALARY 2026-11-02', 'Recorded on the director''s loan account until a payroll with PAYE is in place.', 'bank statement import')`;
    await q`INSERT INTO data_updates (id) VALUES ('expenses-director-loan-2026-11') ON CONFLICT DO NOTHING`;
  }
  // November 2026 gym membership income from the FNB statement (to 3 Nov).
  const [gi] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'income-gym-2026-11'`;
  if (!gi) {
    for (const [payer, amt] of [["Ethan Milton", 250], ["E Bowers", 250], ["Naldo", 400]]) {
      const [dup] = await q`SELECT 1 AS x FROM income WHERE payer = ${payer} AND received_on = '2026-11-02' AND amount = ${amt}`;
      if (!dup) await q`INSERT INTO income (received_on, period, payer, category, description, amount, method, reference, created_by)
                        VALUES ('2026-11-02', '2026-11', ${payer}, 'gym_membership', 'Gym membership, November 2026', ${amt}, 'EFT', ${payer}, 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('income-gym-2026-11') ON CONFLICT DO NOTHING`;
  }
  // Rest of the 23 Oct 2026 City bill, and the Citiq building statement for 1–30 Sep 2026 (generated 7 Oct 2026).
  // Bulk electricity = meters 3687848 + 3687919, which feed the Citiq prepaid sub-meters.
  const [pp] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'city-bill-full-and-citiq-2026-11'`;
  if (!pp) {
    await q`UPDATE city_bills SET rates = 10118.20, water_use = 4351.60, sewer_use = 3090.07,
              bulk_elec = 7847.58, bulk_elec_fixed = 4204.18, bulk_elec_kwh = 1239, other_charges = 179.13
            WHERE period = '2026-11' AND rates IS NULL`;
    const citiq = [
      ["54730327472", "2 Marbole", "5", 0, 0, 0],
      ["54730327662", "3 Potters", "10", 93.8, 350, 279.10],
      ["54730327530", "4 S A fun", "9", 48.2, 180, 132.36],
      ["54730327654", "5 Design", "4", 26.8, 100, 63.31],
      ["54220992363", "6 mercy &", "8", 388.6, 1450, 1251.50],
      ["54730327605", "7 office", "7", 0, 0, 0],
      ["54730327555", "8 joseph", "6", 53.6, 200, 149.62],
    ];
    for (const [m, label, unit] of citiq) {
      await q`INSERT INTO prepaid_meters (meter_no, label, unit_code) VALUES (${m}, ${label}, ${unit}) ON CONFLICT DO NOTHING`;
    }
    const [has] = await q`SELECT 1 AS x FROM city_prepaid WHERE period = '2026-11'`;
    if (!has) for (const [m, label, unit, kwh, tokens, rec] of citiq) {
      await q`INSERT INTO city_prepaid (period, meter_no, unit_code, label, kwh, tokens, recovery, statement_period)
              VALUES ('2026-11', ${m}, ${unit}, ${label}, ${kwh}, ${tokens}, ${rec}, '1–30 Sep 2026')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('city-bill-full-and-citiq-2026-11') ON CONFLICT DO NOTHING`;
  }
  // FNB 63008524414 statement, 3–6 Nov 2026 (balance R21,996.19): items not already recorded.
  const [f6] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'fnb-2026-11-03-to-06'`;
  if (!f6) {
    const pays = [
      ["Kekkel en Kraai%", "2026-11-05", 24286.50, "FNB 5 Nov 2026 — Kekkel en Kraai Atlantis", "November 2026 rent"],
      ["SA Funerals%", "2026-11-05", 4130.00, "FNB 5 Nov 2026 — ADT CASH DEPO SA FUNERAL TRUST/ATL", "November 2026 rent (cash deposit)"],
      ["Merce%", "2026-11-05", 3400.00, "FNB 5 Nov 2026 — ADT CASH DEPO ATLANTIS MERS", "Cash deposit referenced 'ATLANTIS MERS' — taken as Merce & Pedros; confirm"],
      ["Something Meaty%", "2026-11-05", 66905.00, "FNB 5 Nov 2026 — CASH DEPOSIT BRACKFEL SWEETLIPS", "Sweetlips cash deposit; larger of the two taken as Shop 1 (invoice carries the 74861 electricity) — confirm split"],
      ["Visfabriek%", "2026-11-05", 29288.00, "FNB 5 Nov 2026 — CASH DEPOSIT BRACKFEL SWEETLIPS", "Sweetlips cash deposit; smaller of the two taken as Shop 3 — confirm split"],
    ];
    for (const [pat, on, amt, ref, note] of pays) {
      const [t] = await q`SELECT id FROM tenants WHERE trading_name ILIKE ${pat} ORDER BY id LIMIT 1`;
      if (!t) continue;
      const [dup] = await q`SELECT 1 AS x FROM payments WHERE tenant_id = ${t.id} AND paid_on = ${on} AND amount = ${amt}`;
      if (!dup) await q`INSERT INTO payments (tenant_id, paid_on, amount, reference, note, created_by)
                        VALUES (${t.id}, ${on}, ${amt}, ${ref}, ${note}, 'bank statement import')`;
    }
    const inc = [
      ["2026-11-03", "L Schwartz", "gym_membership", "Gym membership, November 2026", 500, "EFT", "CAPITEC L SCHWARTZ"],
      ["2026-11-03", "T Karolus", "gym_membership", "Gym membership, November 2026", 400, "EFT", "CAPITEC T KAROLUS"],
      ["2026-11-05", "Conrad John", "gym_membership", "Gym membership, November 2026", 350, "EFT", "CAPITEC CONRAD JOHN"],
      ["2026-11-05", "Rebel Fitness", "gym_cash", "Gym cash takings deposited", 5480, "Cash deposit", "ADT CASH DEPO ATLANTIS REBEL FITNESS"],
    ];
    for (const [on, payer, cat, desc, amt, method, ref] of inc) {
      const [dup] = await q`SELECT 1 AS x FROM income WHERE payer = ${payer} AND received_on = ${on} AND amount = ${amt}`;
      if (!dup) await q`INSERT INTO income (received_on, period, payer, category, description, amount, method, reference, created_by)
                        VALUES (${on}, '2026-11', ${payer}, ${cat}, ${desc}, ${amt}, ${method}, ${ref}, 'bank statement import')`;
    }
    const exp = [
      ["2026-11-03", "FNB card", "other", "Card purchase — not yet identified", 321.75, "Card", "FNB CARD 8812710185656000 2026-11-03",
       "Find the slip and say what it was for; personal spend goes to the director's loan account."],
      ["2026-11-03", "Scheduled transfer", "other", "Scheduled transfer — recipient not shown", 1000, "EFT", "SCHEDULE TRANSFER 2026-11-03 R1000",
       "Identify the recipient. If it went to the director or a personal account, re-categorise as director's loan."],
      ["2026-11-03", "Scheduled transfer", "other", "Scheduled transfer — recipient not shown", 500, "EFT", "SCHEDULE TRANSFER 2026-11-03 R500",
       "Identify the recipient. If it went to the director or a personal account, re-categorise as director's loan."],
      ["2026-11-05", "Director", "director_loan", "Transfer labelled DIRECTOR SALARY — no payroll/PAYE, so drawings", 500, "EFT", "DIRECTOR SALARY 2026-11-05 R500",
       "Recorded on the director's loan account until a payroll with PAYE is in place."],
      ["2026-11-05", "Director", "director_loan", "Transfer labelled DIRECTOR SALARY — no payroll/PAYE, so drawings", 2500, "EFT", "DIRECTOR SALARY 2026-11-05 R2500",
       "Recorded on the director's loan account until a payroll with PAYE is in place."],
      ["2026-11-05", "Kempston Group", "vehicle_finance", "Vehicle finance instalment, November 2026", 40000, "EFT", "LOAN REPAYMENT 2026-11-05",
       "Only the interest portion is deductible — get the Kempston statement for the split."],
      ["2026-11-05", "City of Cape Town", "municipal", "Payment on account 231703234 (Oct 2026 bill, arrears)", 60000, "EFT", "MUNCIPAL BILL 2026-11-05",
       "Against tax invoice 240010083074 (due 17 Nov 2026). Keep the bill and proof of payment."],
      ["2026-11-06", "City of Cape Town", "municipal", "Payment on account 231703234 (arrangement instalment)", 10000, "EFT", "MUNCIPAL BILL 2026-11-06",
       "Matches the R10,000 monthly arrangement instalment. Keep proof of payment."],
    ];
    for (const [on, sup, cat, desc, amt, method, ref, notes] of exp) {
      const [dup] = await q`SELECT 1 AS x FROM expenses WHERE reference = ${ref}`;
      if (!dup) await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, notes, created_by)
                        VALUES (${on}, '2026-11', ${sup}, ${cat}, ${desc}, ${amt}, 0, ${method}, ${ref}, ${notes}, 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('fnb-2026-11-03-to-06') ON CONFLICT DO NOTHING`;
  }
  // Potter's House cash deposit, 6 Nov 2026 (FNB balance after R29,546.19).
  const [ph] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'payment-potters-2026-11-06'`;
  if (!ph) {
    const [t] = await q`SELECT id FROM tenants WHERE trading_name ILIKE 'Potter%' ORDER BY id LIMIT 1`;
    if (t) {
      const [dup] = await q`SELECT 1 AS x FROM payments WHERE tenant_id = ${t.id} AND paid_on = '2026-11-06' AND amount = 7550`;
      if (!dup) await q`INSERT INTO payments (tenant_id, paid_on, amount, reference, note, created_by)
                        VALUES (${t.id}, '2026-11-06', 7550, 'FNB 6 Nov 2026 — ADT CASH DEPO ATLANTIS POTTERS HOUSE',
                                'November 2026 rent (cash deposit). Bank cash-deposit fee R111.90 comes off in the monthly fees.', 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('payment-potters-2026-11-06') ON CONFLICT DO NOTHING`;
  }
  // FNB 63008524414 statement, 6–7 Nov 2026 (balance R5,850.76): items not already recorded.
  // Renasa debits on the 7th each month (Sep R6,296.61, Oct R5,395.43); this is November's.
  const [f7] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'fnb-2026-11-06-to-07'`;
  if (!f7) {
    const exp = [
      ["2026-11-06", "City of Cape Town", "municipal", "Payment on account 231703234", 16000, "EFT", "MUNCIPAL BILL 2026-11-06 R16000",
       "Third City payment this month (R60,000 on 5 Nov, R10,000 and R16,000 on 6 Nov = R86,000), against the Oct 2026 bill and arrears. Keep proof of payment."],
      ["2026-11-06", "David Tippins", "other", "Payment to David Tippins — purpose not shown", 1200, "EFT", "SEND David Tippins 2026-11-06",
       "Say what this was for. Work on the building needs an invoice or signed slip; a personal payment goes to the director's loan account."],
      ["2026-11-07", "Director", "director_loan", "Transfer labelled DIRECTOR SALARY — no payroll/PAYE, so drawings", 500, "EFT", "DIRECTOR SALARY 2026-11-07 R500",
       "Recorded on the director's loan account until a payroll with PAYE is in place."],
      ["2026-11-07", "Renasa Insurance", "insurance", "Insurance premium, November 2026 (debit order)", 5995.43, "Debit order", "ECIARENASADBNR000252 RF1V7AAF",
       "R600 more than October (R5,395.43). Keep the policy schedule and confirm it covers the building and company assets only."],
    ];
    for (const [on, sup, cat, desc, amt, method, ref, notes] of exp) {
      const [dup] = await q`SELECT 1 AS x FROM expenses WHERE reference = ${ref}`;
      if (!dup) await q`INSERT INTO expenses (spent_on, period, supplier, category, description, amount, vat, method, reference, notes, created_by)
                        VALUES (${on}, '2026-11', ${sup}, ${cat}, ${desc}, ${amt}, 0, ${method}, ${ref}, ${notes}, 'bank statement import')`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('fnb-2026-11-06-to-07') ON CONFLICT DO NOTHING`;
  }
  // Balance adjustments: amounts waived or written off on a tenant's account (negative reduces what they owe).
  await q`CREATE TABLE IF NOT EXISTS balance_adjustments (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id),
    period TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  // Waive everything owed up to and including November 2026, except Merce & Pedros (Duncan, 6 Nov 2026):
  // invoices are enforced from December 2026. Credits (overpayments) are left alone.
  // Claim the update atomically so two instances starting together can't both apply it.
  const wv = await q`SELECT 1 AS x FROM data_updates WHERE id = 'waive-balances-to-2026-11'`;
  const claimed = wv.length ? [] : await q`INSERT INTO data_updates (id) VALUES ('waive-balances-to-2026-11') ON CONFLICT DO NOTHING RETURNING id`;
  if (claimed.length) {
    const P = "2026-11";
    const owing = await q`
      WITH inv AS (
        SELECT tenant_id, SUM(total)::float AS t FROM invoices
        WHERE status = 'issued' AND period <= ${P} GROUP BY tenant_id
      ), dr AS (
        SELECT d.tenant_id, d.total::float AS t FROM invoices d
        WHERE d.status = 'draft' AND d.kind = 'invoice' AND d.period = ${P}
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = d.tenant_id AND i.period = ${P} AND i.status = 'issued')
      ), pay AS (
        SELECT tenant_id, SUM(amount)::float AS t FROM payments
        WHERE COALESCE(period, substr(paid_on, 1, 7)) <= ${P} GROUP BY tenant_id
      ), adj AS (
        SELECT tenant_id, SUM(amount)::float AS t FROM balance_adjustments WHERE period <= ${P} GROUP BY tenant_id
      )
      SELECT t.id, t.trading_name,
             ROUND((COALESCE(inv.t,0) + COALESCE(dr.t,0) - COALESCE(pay.t,0) + COALESCE(adj.t,0))::numeric, 2)::float AS due
      FROM tenants t
      LEFT JOIN inv ON inv.tenant_id = t.id LEFT JOIN dr ON dr.tenant_id = t.id
      LEFT JOIN pay ON pay.tenant_id = t.id LEFT JOIN adj ON adj.tenant_id = t.id
      WHERE t.trading_name NOT ILIKE 'Merce%'`;
    for (const o of owing) {
      if (!(o.due > 0)) continue;
      const [had] = await q`SELECT 1 AS x FROM balance_adjustments WHERE tenant_id = ${o.id} AND period = ${P} AND created_by = 'Duncan' AND reason LIKE 'Balance to November 2026 waived%'`;
      if (had) continue;
      await q`INSERT INTO balance_adjustments (tenant_id, period, amount, reason, created_by)
              VALUES (${o.id}, ${P}, ${-o.due}, 'Balance to November 2026 waived — invoices enforced from December 2026 (Duncan, 6 Nov 2026)', 'Duncan')`;
      await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
              VALUES (${o.id}, '2026-11-06', 'Note', ${`Balance of R${o.due.toFixed(2)} owing to November 2026 waived; invoices enforced from December 2026.`})`;
    }
  }
  // If the waiver was applied twice by instances starting together, keep only the first entry per tenant.
  await q`DELETE FROM balance_adjustments a USING balance_adjustments b
          WHERE a.tenant_id = b.tenant_id AND a.period = b.period AND a.reason = b.reason
            AND a.reason LIKE 'Balance to November 2026 waived%' AND a.id > b.id`;
  await q`DELETE FROM tenant_events a USING tenant_events b
          WHERE a.tenant_id = b.tenant_id AND a.text = b.text AND a.text LIKE '%owing to November 2026 waived%' AND a.id > b.id`;
  // Unit areas implied by the refuse/sewerage split on the Nov 2026 invoices, where no lease gives one.
  const [areas] = await q`SELECT 1 AS x FROM data_updates WHERE id = 'unit-areas-from-invoices'`;
  if (!areas) {
    for (const [code, a] of [["4", 62], ["8", 89], ["9", 17], ["10", 100]]) {
      await q`UPDATE units SET area_m2 = ${a} WHERE code = ${code} AND area_m2 IS NULL`;
    }
    await q`INSERT INTO data_updates (id) VALUES ('unit-areas-from-invoices') ON CONFLICT DO NOTHING`;
  }
}
