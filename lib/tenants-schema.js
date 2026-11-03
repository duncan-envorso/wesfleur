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
  {
    id: "2026-11-03-apply-2025-leases",
    // Applies the signed 2025 leases (Sweetlips Shops 1 and 3, JVC Shop 6) to databases created
    // from the earlier tenant roll, where these tenants still had the old status and no dates.
    async run(q) {
      const targets = [
        { match: "Sweetlips / Visfabriek 1%", seed: "Sweetlips / Visfabriek 1", unit: "1", area: 190 },
        { match: "Sweetlips / Visfabriek 2%", seed: "Sweetlips / Visfabriek 2", unit: "3", area: 389 },
        { match: "JVC J%", seed: "JVC Josephs & Co", unit: "6", area: 58 },
      ];
      for (const t of targets) {
        const spec = SEED_TENANTS.find((x) => x.tenant.trading_name === t.seed);
        const [ten] = await q`SELECT id FROM tenants WHERE trading_name ILIKE ${t.match} ORDER BY id LIMIT 1`;
        if (!spec || !ten) continue;
        const x = spec.tenant;
        await q`UPDATE tenants SET trading_name = ${x.trading_name}, legal_name = ${x.legal_name || null},
                  reg_no = ${x.reg_no || null}, contact_name = ${x.contact_name || null},
                  surety_name = ${x.surety_name || null}, notes = ${x.notes || null}
                WHERE id = ${ten.id}`;
        await q`UPDATE units SET area_m2 = ${t.area} WHERE code = ${t.unit} AND area_m2 IS NULL`;
        const [unit] = await q`SELECT id FROM units WHERE code = ${t.unit}`;
        const l = spec.leases[0];
        const [lease] = await q`SELECT id, rent_from FROM leases WHERE tenant_id = ${ten.id} AND status <> 'ended' ORDER BY id DESC LIMIT 1`;
        if (!lease) continue;
        await q`UPDATE leases SET unit_id = ${unit?.id ?? null}, status = 'signed', start_date = ${l.start_date}, end_date = ${l.end_date},
                  escalation_pct = ${l.escalation_pct}, escalation_month = ${l.escalation_month}, escalation_day = ${l.escalation_day},
                  deposit_required = COALESCE(deposit_required, ${l.deposit_required ?? null}),
                  deposit_held = COALESCE(deposit_held, ${l.deposit_held ?? null}),
                  vat_basis = ${l.vat_basis}, renewal_option = ${l.renewal_option}, notice_by = ${l.notice_by}, notes = ${l.notes}
                WHERE id = ${lease.id}`;
        // Only set the rent and its start date if nobody has recorded a rent change since.
        if (!lease.rent_from) {
          await q`UPDATE leases SET current_rent = ${l.current_rent}, rent_from = ${l.rent_from} WHERE id = ${lease.id}`;
          await q`UPDATE rent_history SET effective_from = ${l.rent_from}, amount = ${l.current_rent},
                    reason = 'Year-1 rent per signed 2025 lease'
                  WHERE lease_id = ${lease.id} AND effective_from IS NULL`;
        }
        const events = [...(spec.events || []), ["2026-11-03", "Lease", "Lease confirmed signed by both parties (Duncan, 3 Nov 2026)."]];
        for (const [date, kind, text] of events) {
          const [dup] = await q`SELECT 1 AS x FROM tenant_events WHERE tenant_id = ${ten.id} AND text = ${text}`;
          if (!dup) await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text) VALUES (${ten.id}, ${date}, ${kind}, ${text})`;
        }
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
