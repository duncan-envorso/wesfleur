// Starting data from the Westfleur tenant roll (16 May 2026, updated Nov 2026) and the Nov 2026 invoices.
// Current rent = what INV0000446–454 bill. Unknown facts are left blank so the app flags them.

export const SEED_UNITS = [
  ["1", "Shop 1", null], ["2", "Shop 2", 159], ["3", "Shop 3", null], ["4", "Shop 4", null],
  ["5", "Shop 5", null], ["6", "Shop 6", null], ["7", "Shop 7", null], ["8", "Shop 8", null],
  ["9", "Shop 9", null], ["10", "Shop 10", null],
];

export const SEED_TENANTS = [
  {
    tenant: { trading_name: "Sweetlips / Visfabriek 1", legal_name: "Sweetlips Seafood & Chicken",
      notes: "Same operator as Shop 3 (combined ~48% of rent)." },
    leases: [{ unit: "1", status: "signed", end_date: "2025-02-28", current_rent: 26512.02, escalation_pct: 6,
      notes: "Lease expired Feb 2025. Renewal drafted but never signed — sign or formally rescind. Invoice also recharges electricity (R38,154.60 in Nov 2026) without meter readings." }],
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
    tenant: { trading_name: "Sweetlips / Visfabriek 2", legal_name: "Sweetlips Seafood & Chicken" },
    leases: [{ unit: "3", status: "signed", end_date: "2030-10-31", current_rent: 24618.30, escalation_pct: 6,
      deposit_required: 21000, deposit_held: 6000, notes: "Longest lease. Deposit per lease R21,000; books show R6,000." }],
  },
  {
    tenant: { trading_name: "Marebole Security Solutions", legal_name: "Marebole Security Solutions" },
    leases: [{ unit: "5", status: "unsigned", current_rent: 7986.00, escalation_pct: 7.42,
      notes: "Only a 2026 draft lease seen; original never sighted. Roll shows R7,989." }],
  },
  {
    tenant: { trading_name: "JVC Jozephs & Co", legal_name: "JVC Jozephs & Co" },
    leases: [{ unit: "6", status: "unsigned", current_rent: 7462.91, escalation_pct: 10,
      notes: "No lease sighted — request signed copy. Rent corrected to lease-implied R7,462.91 (was over-billed R523.09/month)." }],
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
