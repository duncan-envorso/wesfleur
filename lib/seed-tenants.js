// Starting data from the Westfleur tenant roll (16 May 2026, updated Nov 2026) and the Nov 2026 invoices.
// Current rent = what INV0000446–454 bill. Unknown facts are left blank so the app flags them.

export const SEED_UNITS = [
  ["1", "Shop 1", 190], ["2", "Shop 2", 159], ["3", "Shop 3", 389], ["4", "Shop 4", null],
  ["5", "Shop 5", 63], ["6", "Shop 6", 58], ["7", "Shop 7", null], ["8", "Shop 8", null],
  ["9", "Shop 9", null], ["10", "Shop 10", null],
];

export const SEED_TENANTS = [
  {
    tenant: { trading_name: "Something Meaty", legal_name: "Sweetlips Seafood and Chicken (Pty) Ltd",
      reg_no: "2012/089270/07", contact_name: "Sebastian Duartee", surety_name: "Sebastian Duartee (ID 7802145190080)",
      notes: "Butchery / meat business. Same company as Visfabriek in Shop 3 (combined ~48% of rent). Notices: attention Sebastian Duartee." },
    leases: [{ unit: "1", status: "signed", start_date: "2025-11-01", end_date: "2030-10-31", current_rent: 26512.00,
      rent_from: "2025-11-01", escalation_pct: 6, escalation_month: 11, escalation_day: 1,
      deposit_required: 21000, deposit_held: null, vat_basis: "exclusive", renewal_option: "5 years (rent agreed or set by valuer, not below final year)",
      notice_by: "2030-07-31",
      notes: "Lease Agreement 2025 (corrected), 5 years 1 Nov 2025 – 31 Oct 2030. 190 m². Rent R26,512.00 excl. VAT, +6% each 1 Nov. Operating costs R1/m² = R190/month + VAT, +7% compounded from 1 Nov 2026 — not on the Nov 2026 invoice. Electricity by sub-meter, payable within 2 days of invoice. Tenant pays its share of rates increases after 1 Nov 2025. Late interest prime + 3%. Deposit R21,000 recorded as paid before signing — confirm against the books." }],
    events: [["2026-05-18", "Lease", "Suretyship signed by Sebastian Duartee at Brackenfell for the 2025 Shop 1 lease."]],
  },
  {
    tenant: { trading_name: "Kekkel en Kraai Atlantis", legal_name: "Linann Chickens CC", reg_no: "CK1994/22204/23",
      contact_name: "EHH Van Deventer", surety_name: "EHH Van Deventer",
      notes: "Pays the City directly for electricity on account 231685950 (meter 1103322), which is in Westfleur Centre's name." },
    leases: [
      { unit: "2", status: "signed", start_date: "2022-02-01", end_date: "2027-01-31", current_rent: 24286.92,
        rent_from: "2026-02-01", escalation_pct: 7, deposit_required: 0, deposit_held: 0, vat_basis: "silent",
        notes: "Lease signed 2–3 Feb 2022. Feb–Apr 2026 increase was billed late: about R4,767 still to recover." },
      { unit: "2", status: "renewal", start_date: "2027-02-01", end_date: "2032-01-31", current_rent: 25987.01,
        rent_from: "2027-02-01", escalation_pct: 7, deposit_required: 0, deposit_held: 0, vat_basis: "exclusive",
        renewal_option: "5 years", notice_by: "2031-10-31",
        notes: "Renewal drafted Oct/Nov 2026. Operating costs R2/m² (R318/month). Blanks to fill: surety ID, address, marital status, site plan. Reword VAT clause 9.1 before signing." },
    ],
    events: [["2026-11-02", "Lease", "Renewal lease drafted for 1 Feb 2027 – 31 Jan 2032 at R25,987.01."]],
  },
  {
    tenant: { trading_name: "Visfabriek", legal_name: "Sweetlips Seafood and Chicken (Pty) Ltd",
      reg_no: "2012/089270/07", contact_name: "Sebastian Duartee", surety_name: "Sebastian Duartee (ID 7802145190080)",
      notes: "Fish business (the larger shop). Same company as Something Meaty in Shop 1. Notices: attention Sebastian Duartee." },
    leases: [{ unit: "3", status: "signed", start_date: "2025-11-01", end_date: "2030-10-31", current_rent: 24618.30,
      rent_from: "2025-11-01", escalation_pct: 6, escalation_month: 11, escalation_day: 1,
      deposit_required: 21000, deposit_held: 6000, vat_basis: "exclusive", renewal_option: "5 years (rent agreed or set by valuer, not below final year)",
      notice_by: "2030-07-31",
      notes: "Lease Agreement 2025 (corrected), 5 years 1 Nov 2025 – 31 Oct 2030. 389 m². Rent R24,618.30 excl. VAT, +6% each 1 Nov. Operating costs R1/m² = R389/month + VAT, +7% compounded from 1 Nov 2026 — not on the Nov 2026 invoice. Electricity by sub-meter. Tenant pays its share of rates increases after 1 Nov 2025. Late interest prime + 3%. Lease records a R21,000 deposit as paid; books show R6,000." }],
    events: [["2026-05-18", "Lease", "Suretyship signed by Sebastian Duartee at Brackenfell for the 2025 Shop 3 lease."]],
  },
  {
    tenant: { trading_name: "Marebole Security Solutions", legal_name: "Marebole Security Solutions (Pty) Ltd",
      reg_no: "2009/006094/07", postal_address: "93 River Road, Lyttelton Manor, Centurion, 0157 (registered office)",
      notes: "Security services provider: admin office, dispatch and equipment storage. No surety (guarantee clause deleted)." },
    leases: [{ unit: "5", status: "signed", start_date: "2026-06-01", end_date: "2029-05-31", current_rent: 8784.72,
      rent_from: "2026-06-01", escalation_pct: 10, escalation_month: 6, escalation_day: 1,
      deposit_required: 6000, deposit_held: 6000, vat_basis: "exclusive", renewal_option: "3 years (rent agreed or set by valuer, not below final year)",
      notice_by: "2029-02-28",
      notes: "Marebole Lease 2026 (signed): 3 years 1 Jun 2026 – 31 May 2029, replacing an oral lease. Premises called 'Office 2', 63 m². Rent R8,784.72 excl. VAT (R139.44/m²), +10% each 1 Jun: R9,663.19 from 1 Jun 2027, R10,629.51 from 1 Jun 2028. Operating costs R5/m² = R315/month + VAT, +7% compounded from 1 Jun 2027. Deposit R6,000 recorded as paid. BILLING: invoices since June 2026 still charge the old R7,986 — R798.72/month short (R4,792.32 for Jun–Nov 2026) and operating costs (R315/month, R1,890 Jun–Nov) not billed. Tenant's domicilium address left blank in the lease — get it." }],
    events: [["2026-11-03", "Lease", "2026 lease confirmed signed (Duncan, 3 Nov 2026). Invoices since 1 Jun 2026 billed R7,986 instead of R8,784.72 and omitted R315 operating costs."]],
  },
  {
    tenant: { trading_name: "JVC Josephs & Co", legal_name: "Joseph Vivian Christopher t/a JVC Josephs & Co",
      reg_no: "ID 5901155119088", contact_name: "Joseph Vivian Christopher",
      notes: "Attorney's office (lease use: professional legal services). Individual lessee, no surety (guarantee clause struck out)." },
    leases: [{ unit: "6", status: "signed", start_date: "2025-10-01", end_date: "2028-09-30", current_rent: 7462.91,
      rent_from: "2025-10-01", escalation_pct: 10, escalation_month: 10, escalation_day: 1,
      deposit_required: null, deposit_held: null, vat_basis: "exclusive", renewal_option: "3 years (rent agreed or set by valuer, not below final year)",
      notice_by: "2028-06-30",
      notes: "JVC Josephs Lease (signed): 3 years 1 Oct 2025 – 30 Sep 2028, replacing an oral lease. Premises called 'Office 1', 58 m². Rent R7,462.91 excl. VAT (R128.67/m²), +10% each 1 Oct: R8,209.20 from 1 Oct 2026, R9,030.12 from 1 Oct 2027. Operating costs R5/m² = R290/month + VAT, up to 5% a year from 1 Oct 2026. Tenant pays its share of rates increases (revaluation increases capped at 15%). Late interest prime + 3%. Deposit amount left blank in the lease." }],
  },
  {
    tenant: { trading_name: "T Adams", legal_name: "Tamere Adams" },
    leases: [{ unit: null, status: "none", current_rent: 3500, rent_from: "2026-07-01",
      notes: "Paying R3,500/month since July 2026, not on the roll. Possibly Shop 7 — confirm unit and put a lease in place." }],
  },
  {
    tenant: { trading_name: "Merce & Pedros Hair Salon", legal_name: "Merce & Pedros Hair Salon" },
    leases: [{ unit: "8", status: "none", current_rent: 10000,
      notes: "No lease. Roll shows R5,000 but invoices bill R10,000 — agree the rent in writing. No payments in May, Sep, Oct 2026." }],
  },
  {
    tenant: { trading_name: "SA Funerals", legal_name: "SA Funerals" },
    leases: [{ unit: "9", status: "unsigned", current_rent: 3993.00, escalation_pct: 7,
      notes: "No lease sighted. Roll shows R4,043; invoice bills R3,993 — check which is right." }],
  },
  {
    tenant: { trading_name: "Potter's House Church", legal_name: "Potter's House Church" },
    leases: [{ unit: "10", status: "signed", end_date: "2024-01-31", current_rent: 7043.99, escalation_pct: 7,
      notes: "Expired Jan 2024, holdover. Billing R7,043.99; with the 7% increase it would be R7,537.07 — confirm the increase date and holdover terms. Water over-billed in Nov 2026 (R3,941.78 vs ~R386 by meter)." }],
  },
  {
    tenant: { trading_name: "Design2Work", legal_name: "Design2Work (Pty) Ltd" },
    leases: [{ unit: "4", status: "ended", current_rent: 3323, end_date: "2026-04-30",
      notes: "Vacated; last payment 23 Apr 2026. Confirm vacate date, rent owed to that date, deposit refund and final utilities. INV0000451 (Nov 2026) issued in error." }],
  },
];
