import { SEED_TENANTS, SEED_UNITS } from "./seed-tenants";
import { createTodoSchema } from "./todos";

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
        { match: "Sweetlips / Visfabriek 1%", seed: "Something Meaty", unit: "1", area: 190 },
        { match: "Sweetlips / Visfabriek 2%", seed: "Visfabriek", unit: "3", area: 389 },
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
  {
    id: "2026-11-03-marebole-2026-lease",
    // Marebole's signed 2026 lease (1 Jun 2026 – 31 May 2029) applied to the existing record.
    async run(q) {
      const spec = SEED_TENANTS.find((x) => x.tenant.trading_name === "Marebole Security Solutions");
      const [ten] = await q`SELECT id FROM tenants WHERE trading_name ILIKE 'Marebole%' ORDER BY id LIMIT 1`;
      if (!spec || !ten) return;
      const x = spec.tenant;
      await q`UPDATE tenants SET legal_name = ${x.legal_name}, reg_no = ${x.reg_no},
                postal_address = COALESCE(postal_address, ${x.postal_address}), notes = ${x.notes} WHERE id = ${ten.id}`;
      await q`UPDATE units SET area_m2 = 63 WHERE code = '5' AND area_m2 IS NULL`;
      const [unit] = await q`SELECT id FROM units WHERE code = '5'`;
      const l = spec.leases[0];
      const [lease] = await q`SELECT id, rent_from FROM leases WHERE tenant_id = ${ten.id} AND status <> 'ended' ORDER BY id DESC LIMIT 1`;
      if (!lease) return;
      await q`UPDATE leases SET unit_id = ${unit?.id ?? null}, status = 'signed', start_date = ${l.start_date}, end_date = ${l.end_date},
                escalation_pct = ${l.escalation_pct}, escalation_month = ${l.escalation_month}, escalation_day = ${l.escalation_day},
                deposit_required = COALESCE(deposit_required, ${l.deposit_required}), deposit_held = COALESCE(deposit_held, ${l.deposit_held}),
                vat_basis = ${l.vat_basis}, renewal_option = ${l.renewal_option}, notice_by = ${l.notice_by}, notes = ${l.notes}
              WHERE id = ${lease.id}`;
      if (!lease.rent_from) {
        await q`UPDATE leases SET current_rent = ${l.current_rent}, rent_from = ${l.rent_from} WHERE id = ${lease.id}`;
        await q`INSERT INTO rent_history (lease_id, effective_from, amount, reason)
                VALUES (${lease.id}, ${l.rent_from}, ${l.current_rent}, 'Year-1 rent per signed 2026 lease (invoices still at R7,986)')`;
      }
      for (const [date, kind, text] of spec.events) {
        const [dup] = await q`SELECT 1 AS x FROM tenant_events WHERE tenant_id = ${ten.id} AND text = ${text}`;
        if (!dup) await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text) VALUES (${ten.id}, ${date}, ${kind}, ${text})`;
      }
    },
  },
  {
    id: "2026-11-03-split-sweetlips-names",
    // Shop 1 trades as Something Meaty (meat) and Shop 3 as Visfabriek (fish); both are Sweetlips Seafood and Chicken (Pty) Ltd.
    async run(q) {
      const renames = [
        ["Sweetlips / Visfabriek 1%", "Something Meaty", "Butchery / meat business. Same company as Visfabriek in Shop 3 (combined ~48% of rent). Notices: attention Sebastian Duartee."],
        ["Sweetlips / Visfabriek 2%", "Visfabriek", "Fish business (the larger shop). Same company as Something Meaty in Shop 1. Notices: attention Sebastian Duartee."],
      ];
      for (const [from, to, notes] of renames) {
        const [t] = await q`SELECT id FROM tenants WHERE trading_name ILIKE ${from} ORDER BY id LIMIT 1`;
        if (!t) continue;
        await q`UPDATE tenants SET trading_name = ${to}, notes = ${notes} WHERE id = ${t.id}`;
        await q`UPDATE meters SET tenant = ${to} WHERE tenant ILIKE ${from}`;
        await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
                VALUES (${t.id}, '2026-11-03', 'Note', ${`Trading name changed to ${to} (Duncan, 3 Nov 2026).`})`;
      }
    },
  },
  {
    id: "2026-11-23-lease-audit-todos",
    // Lease audit (23 Nov 2026): the Shop 1 and Shop 3 PDFs in Drive carry only Sebastian Duartee's
    // signature on the suretyship (18 May 2026); page 53 of each lease is unsigned by both parties.
    // Adds the follow-up tasks to the To-do list and corrects the tenant history.
    async run(q) {
      await createTodoSchema(q);
      const tenantId = async (like) => (await q`SELECT id FROM tenants WHERE trading_name ILIKE ${like} ORDER BY id LIMIT 1`)[0]?.id ?? null;
      const tasks = [
        ["Something Meaty%", "1", null, "Get Shop 1 lease signed (p. 53) and landlord line on suretyship (p. 56)",
          "Drive copy is unsigned on p. 53; only Sebastian's suretyship signature (18 May 2026). Kirah signs p. 53 for Westfleur and p. 56 as landlord; Sebastian signs p. 53 for Sweetlips. Fill in place and date. Scan the signed copy to Drive."],
        ["Visfabriek%", "3", null, "Get Shop 3 lease signed (p. 53) and landlord line on suretyship (p. 56)",
          "Same as Shop 1: p. 53 unsigned by both parties, suretyship signed by Sebastian on 18 May 2026. Kirah signs p. 53 and p. 56; Sebastian signs p. 53 for Sweetlips. Scan the signed copy to Drive."],
        ["Something Meaty%", "1", null, "Rename Shop 1 lease PDF in Drive (remove 'and Signed')",
          "'Visfabriek 1 (Shop 1) - Lease Agreement (2025) - Corrected and Signed).pdf' is not signed on p. 53. Rename so nobody relies on it; replace with the signed scan when available."],
        ["Marebole%", "5", null, "Upload signed Marebole 2026 lease to Drive",
          "Only 'Marebole Lease 2026 - Draft.docx' is in Drive. Find the signed copy (1 Jun 2026 - 31 May 2029) and scan it in. Also get their domicilium address."],
        ["JVC J%", "6", null, "Upload signed JVC Josephs lease to Drive and record the deposit",
          "Only the unsigned Google Doc draft is in Drive (deposit amount blank). Find the signed copy (1 Oct 2025 - 30 Sep 2028), scan it in and record the deposit amount."],
        ["Kekkel%", "2", "2027-01-31", "Sign Kekkel & Kraai 2027 renewal lease",
          "Current lease ends 31 Jan 2027. Renewal drafted (1 Feb 2027 - 31 Jan 2032). Fill surety details and site plan, sign. Delete the old May 2026 draft 'KekkelEnKraai_LeaseAgreement_2027.docx' from Drive."],
        [null, "Gym", "2026-12-31", "Agree rent and sign gym lease with Samantha Cloete",
          "Starts 1 Jan 2027. Her letter says R10,000 fixed for 12 months; Duncan's terms are R10,000 then R15,000. Reply in writing, then sign a lease (lessor Westfleur Centre, signed by Kirah)."],
        ["Potter%", "10", null, "New lease for Potter's House Church",
          "Lease expired Jan 2024; tenant holding over. Put a new lease in place."],
        ["Merce%", "8", null, "Lease for Merce & Pedros Hair Salon",
          "No lease on file. Put a lease in place."],
        ["SA Funerals%", "9", null, "Lease for SA Funerals",
          "No lease on file (only an invoice in their folder). Put a lease in place."],
        ["T Adams%", null, null, "Identify T Adams' unit and put a lease in place",
          "Paying R3,500/month since July 2026; possibly Shop 7. No lease or folder."],
      ];
      for (const [like, unit, due, title, notes] of tasks) {
        const [dup] = await q`SELECT 1 AS x FROM todos WHERE title = ${title}`;
        if (dup) continue;
        const tid = like ? await tenantId(like) : null;
        await q`INSERT INTO todos (title, notes, due_date, priority, tenant_id, unit_code, created_by)
                VALUES (${title}, ${notes}, ${due}, 'high', ${tid}, ${unit}, 'Lease audit 23 Nov 2026')`;
      }
      const correction = "Lease audit 23 Nov 2026: Drive copy of the lease is NOT signed on p. 53 by either party. Only Sebastian Duartee's suretyship (Annex B) is signed, 18 May 2026. Signatures outstanding.";
      for (const like of ["Something Meaty%", "Visfabriek%"]) {
        const tid = await tenantId(like);
        if (!tid) continue;
        const [dup] = await q`SELECT 1 AS x FROM tenant_events WHERE tenant_id = ${tid} AND text = ${correction}`;
        if (!dup) await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text) VALUES (${tid}, '2026-11-23', 'Lease', ${correction})`;
      }
    },
  },
  {
    id: "2026-11-23-lease-tasks-admin-only",
    // The lease-audit tasks mention rents and Samantha's own gym lease: admins only.
    async run(q) {
      await createTodoSchema(q);
      await q`UPDATE todos SET private = true WHERE created_by = 'Lease audit 23 Nov 2026'`;
    },
  },
  {
    id: "2026-11-24-merce-pedros-month-to-month",
    // Duncan, 24 Nov 2026: Merce & Pedros Hair Salon (Shop 8) is month to month at R5,000 (excl. VAT).
    async run(q) {
      const [ten] = await q`SELECT id FROM tenants WHERE trading_name ILIKE 'Merce%' ORDER BY id LIMIT 1`;
      if (!ten) return;
      const [lease] = await q`SELECT id, current_rent FROM leases WHERE tenant_id = ${ten.id} AND status <> 'ended' ORDER BY id DESC LIMIT 1`;
      if (!lease) return;
      await q`UPDATE leases SET status = 'monthly', end_date = NULL, current_rent = 5000, rent_from = '2026-12-01',
                escalation_pct = NULL, escalation_month = NULL, escalation_day = NULL,
                notes = 'Month to month at R5,000/month (Duncan, 24 Nov 2026). Previously invoiced R10,000 with no lease. Record the terms and notice period in writing.'
              WHERE id = ${lease.id}`;
      await q`INSERT INTO rent_history (lease_id, effective_from, amount, reason)
              VALUES (${lease.id}, '2026-12-01', 5000, 'Month to month at R5,000 (Duncan, 24 Nov 2026)')`;
      await q`INSERT INTO tenant_events (tenant_id, event_date, kind, text)
              VALUES (${ten.id}, '2026-11-24', 'Lease', 'Changed to month to month, rent R5,000/month from 1 Dec 2026 (was invoiced R10,000).')`;
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
