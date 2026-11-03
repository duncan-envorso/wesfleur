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
          escalation_pct, deposit_required, deposit_held, vat_basis, renewal_option, notice_by, notes)
        VALUES (${ten.id}, ${l.unit ? units[l.unit] : null}, ${l.status}, ${l.start_date || null}, ${l.end_date || null},
          ${l.current_rent ?? null}, ${l.rent_from || null}, ${l.escalation_pct ?? null}, ${l.deposit_required ?? null},
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
