import { SEED_TENANTS, SEED_UNITS } from "./seed-tenants";

// Dates are stored as ISO text (YYYY-MM-DD) so they come back unchanged from every driver.
export async function createTenantSchema(q) {
  await q`CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    area_m2 NUMERIC(10,2),
    notes TEXT,
    sort INT NOT NULL DEFAULT 0
  )`;
  await q`CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    trading_name TEXT NOT NULL,
    legal_name TEXT,
    reg_no TEXT,
    vat_no TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    postal_address TEXT,
    surety_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS leases (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id INT REFERENCES units(id),
    status TEXT NOT NULL DEFAULT 'signed',
    start_date TEXT,
    end_date TEXT,
    current_rent NUMERIC(12,2),
    rent_from TEXT,
    escalation_pct NUMERIC(6,3),
    escalation_month INT,
    escalation_day INT,
    deposit_required NUMERIC(12,2),
    deposit_held NUMERIC(12,2),
    deposit_date TEXT,
    vat_basis TEXT,
    renewal_option TEXT,
    notice_by TEXT,
    document_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS rent_history (
    id SERIAL PRIMARY KEY,
    lease_id INT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    effective_from TEXT,
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS tenant_events (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_date TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'Note',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  const [{ n }] = await q`SELECT count(*)::int AS n FROM units`;
  if (n === 0) {
    let i = 0;
    for (const [code, name, area] of SEED_UNITS) {
      await q`INSERT INTO units (code, name, area_m2, sort) VALUES (${code}, ${name}, ${area}, ${i++})`;
    }
  }
  const [{ t }] = await q`SELECT count(*)::int AS t FROM tenants`;
  if (t === 0) await seedTenants(q);
  await runDataUpdates(q);
}

// One-off corrections to live data. Each runs once, in order, and is recorded in data_updates.
const DATA_UPDATES = [
  {
    id: "2026-11-03-leases-signed",
    // Duncan confirmed on 3 Nov 2026 that JVC and both Sweetlips leases are signed.
    async run(q) {
      const jvc = await q`SELECT l.id, l.tenant_id FROM leases l JOIN tenants t ON t.id = l.tenant_id
                          WHERE t.trading_name ILIKE 'JVC%' AND l.start_date = '2025-10-01'`;
      const sweet = await q`SELECT l.id, l.tenant_id FROM leases l JOIN tenants t ON t.id = l.tenant_id
                            WHERE t.trading_name ILIKE 'Sweetlips%' AND l.start_date = '2025-11-01'`;
      for (const l of jvc) {
        await q`UPDATE leases SET status = 'signed',
                  notes = replace(replace(notes, 'JVC Josephs Lease (Word draft)', 'JVC Josephs Lease (signed)'),
                    ' The copy on file is an unsigned Word document — mark Signed once the signed copy is filed (clause 39.3 requires pen signatures).', '')
                WHERE id = ${l.id}`;
      }
      for (const l of sweet) {
        await q`UPDATE leases SET notes = regexp_replace(notes, ' Copy on file has blank signature page.*$', '') WHERE id = ${l.id}`;
      }
      for (const l of [...jvc, ...sweet]) {
        await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
                VALUES (${l.tenant_id}, '2026-11-03', 'Lease', 'Lease confirmed signed by both parties (Duncan, 3 Nov 2026).')`;
      }
    },
  },
];

async function runDataUpdates(q) {
  await q`CREATE TABLE IF NOT EXISTS data_updates (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const done = new Set((await q`SELECT id FROM data_updates`).map((r) => r.id));
  for (const u of DATA_UPDATES) {
    if (done.has(u.id)) continue;
    await u.run(q);
    await q`INSERT INTO data_updates (id) VALUES (${u.id}) ON CONFLICT DO NOTHING`;
  }
}

async function seedTenants(q) {
  const units = Object.fromEntries((await q`SELECT id, code FROM units`).map((u) => [u.code, u.id]));
  for (const s of SEED_TENANTS) {
    const x = s.tenant;
    const [ten] = await q`
      INSERT INTO tenants (trading_name, legal_name, reg_no, contact_name, surety_name, notes)
      VALUES (${x.trading_name}, ${x.legal_name || null}, ${x.reg_no || null}, ${x.contact_name || null},
              ${x.surety_name || null}, ${x.notes || null})
      RETURNING id`;
    for (const l of s.leases) {
      const [lease] = await q`
        INSERT INTO leases (tenant_id, unit_id, status, start_date, end_date, current_rent, rent_from,
          escalation_pct, escalation_month, escalation_day, deposit_required, deposit_held, vat_basis, renewal_option, notice_by, notes)
        VALUES (${ten.id}, ${l.unit ? units[l.unit] : null}, ${l.status}, ${l.start_date || null}, ${l.end_date || null},
          ${l.current_rent ?? null}, ${l.rent_from || null}, ${l.escalation_pct ?? null}, ${l.escalation_month ?? null}, ${l.escalation_day ?? null}, ${l.deposit_required ?? null},
          ${l.deposit_held ?? null}, ${l.vat_basis || null}, ${l.renewal_option || null}, ${l.notice_by || null}, ${l.notes || null})
        RETURNING id`;
      if (l.current_rent !== undefined && l.status !== "ended") {
        await q`INSERT INTO rent_history (lease_id, effective_from, amount, reason)
                VALUES (${lease.id}, ${l.rent_from || null}, ${l.current_rent}, 'Opening balance from tenant roll / Nov 2026 invoice')`;
      }
    }
    for (const [date, kind, text] of s.events || []) {
      await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text) VALUES (${ten.id}, ${date}, ${kind}, ${text})`;
    }
  }
}
