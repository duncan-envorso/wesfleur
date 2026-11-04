# Westfleur Centre — meter readings

A phone-friendly web app for reading the water and electricity meters at Westfleur Centre each month.
Take a photo of each meter, enter (or auto-read) the number, and the app works out usage since last
month and the charge at City of Cape Town tariffs. The report compares the City main meter with the
sum of the shop meters, so water nobody is metered for (leaks, common areas, the gym) shows up
instead of landing on a tenant's invoice.

## What it does

- **Invoices** (admins) — each month, "Prepare drafts" builds one invoice per tenant with a current
  lease: rent at the lease's escalated rate for that month, operating costs, water and sewerage from
  the meter readings (readings shown on the invoice), electricity from sub-meters, and refuse. Admins
  review and edit lines (arrears, back-billing, credits), then issue. Issued invoices are numbered in
  sequence (continuing from INV0000455), locked, and downloadable as PDFs with a statement of account
  and payment reference. Corrections are made with credit notes (CN numbers). Record payments to keep
  tenant balances. Until a VAT registration date is set in Settings, documents are titled "Invoice"
  with no VAT; from that date they become tax invoices with VAT added.
- **City bill vs recovery** (Invoices page) — enter the whole City account (rates, water and sewerage,
  bulk electricity, refuse, penalties) and the Citiq prepaid building statement per meter. The app
  compares each City charge with what was invoiced or refunded by Citiq, shows the gap, and flags
  unmetered kWh, a prepaid tariff below City cost, vacant units buying electricity and let units buying none.
- **Users** — the APP_USERNAME login is always an admin. Admins can add users in Settings as
  *admin* or *meter reader*; meter readers can only capture readings.

- **Tenants** — one record per tenant: legal and trading name, registration and VAT numbers,
  contacts, surety; each lease with unit, status, dates, rent, escalation rate and increase date,
  deposit required vs held, VAT basis, renewal option and notice date, link to the signed lease.
  The app works out the next increase and its amount, a year-by-year rent schedule, and flags:
  expired leases (holdover), leases ending within 180 days, missed increases (with the rent it
  should be and the estimated under-billing), increases due within 60 days, deposit shortfalls,
  unsigned or missing leases. Every rent change is kept in a rent history, and each tenant has a
  dated log for notices, arrears, maintenance, insurance and deposit movements.
  It starts with the Westfleur tenant roll loaded; unknown facts are left blank and flagged.

- **Capture** — one card per meter: take a photo, type the reading (`0247,5018` or `247.5018`),
  see usage and cost instantly, save. The photo is stored with the reading as evidence.
  For a meter's first month, enter last month's reading as the opening reading.
- **Report** — per-month table: previous and current readings, usage, water, sewerage, total,
  photos side by side; recharge total; main-meter reconciliation; CSV download and print.
- **Settings** — City tariffs (2026/27 commercial defaults), meters, which meter is the City main
  meter, and which meters are recharged to tenants (untick the gym, common areas and vacant shops).
- **Optional** — "Read from photo" fills the reading in from the picture using Claude, if you add an
  Anthropic API key. Always check the number against the photo.

Charges: water = kL × water tariff; sewerage = 95% of kL × sewerage tariff; plus 15% VAT if
"Add VAT" is on (the City's bill includes VAT, so this recovers the actual cost).

## Deploy to Vercel (about 10 minutes)

1. **Put the code on GitHub.** Create a new private repository and upload the contents of this
   folder (or run `git init && git add . && git commit -m init` and push).
2. **Import into Vercel.** vercel.com → Add New → Project → pick the repository → Deploy.
   The framework (Next.js) is detected automatically. The first deploy will show an error page
   until the next steps are done — that's expected.
3. **Add a database.** In the project: Storage → Create Database → **Neon** (Postgres) → connect
   it to the project. This adds `DATABASE_URL`. The tables and the Westfleur meter list are created
   automatically the first time the app opens.
4. **Add photo storage.** Storage → Create → **Blob** → connect it. This adds `BLOB_READ_WRITE_TOKEN`.
5. **Set the login.** Settings → Environment Variables:
   - `APP_USERNAME` — e.g. `westfleur`
   - `APP_PASSWORD` — a strong password (no colons)
   - optional `SESSION_SECRET` — any long random string; changing it (or the password) signs
     everyone out. Sign-ins otherwise last 30 days per device.
   - optional `ANTHROPIC_API_KEY` (from console.anthropic.com) to enable "Read from photo"
6. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.
7. Open the URL on your phone, log in, and "Add to Home Screen" for quick access.

## Running locally

To run against a local Postgres instead of Neon, set `LOCAL_DATABASE_URL`
(e.g. `postgresql://user@localhost:5432/westfleur`).

```
npm install
cp .env.example .env.local   # fill in DATABASE_URL, BLOB_READ_WRITE_TOKEN, APP_PASSWORD
npm run dev
```

## Notes

- Photo links are long random URLs on Vercel Blob. They aren't listed anywhere, but anyone given a
  link can open that photo.
- Readings are stored per meter per month; saving again for the same month replaces the reading.
- Negative usage is flagged (meter replaced, or a typo) rather than charged.
- Update the tariffs in Settings each July, or if the City declares water restrictions.
