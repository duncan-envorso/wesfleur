import { neon } from "@neondatabase/serverless";
import { DEFAULT_TARIFFS } from "./calc";
import { createTenantSchema } from "./tenants-schema";
import { createBillingSchema } from "./billing-schema";

let sqlClient;
let ready;

// Tests can inject a client with the same interface (tagged template + .query).
export function setClient(c) {
  sqlClient = c;
  ready = null;
}

// Plain Postgres (e.g. a local database) when LOCAL_DATABASE_URL is set; Neon otherwise.
function localClient(url) {
  let pool;
  const run = async (text, params) => {
    if (!pool) {
      const { Pool } = (await import("pg")).default ? (await import("pg")).default : await import("pg");
      pool = new Pool({ connectionString: url });
    }
    return (await pool.query(text, params)).rows;
  };
  const q = (strings, ...vals) => run(strings.reduce((a, s, i) => a + "$" + i + s), vals);
  q.query = run;
  return q;
}

export function sql() {
  if (sqlClient) return sqlClient;
  if (process.env.LOCAL_DATABASE_URL) return (sqlClient = localClient(process.env.LOCAL_DATABASE_URL));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set — connect a Neon database in Vercel.");
  sqlClient ||= neon(process.env.DATABASE_URL);
  return sqlClient;
}

const SEED_METERS = [
  ["City main meter", "Main", "Westfleur Centre (City bill)", "water", true],
  ["Shop 1", "1", "Something Meaty", "water", false],
    ["Shop 2", "2", "Kekkel & Kraai", "water", false],
  ["Shop 3", "3", "Visfabriek", "water", false],
  ["Shop 4", "4", "Vacant", "water", false],
  ["Shop 5", "5", "Marebole Security", "water", false],
  ["Shop 6", "6", "JVC Jozephs & Co", "water", false],
  ["Shop 7", "7", "T Adams (to confirm)", "water", false],
  ["Shop 8", "8", "Merce & Pedros Hair Salon", "water", false],
  ["Shop 9", "9", "SA Funerals", "water", false],
  ["Shop 10", "10", "Potter's House Church", "water", false],
  ["Gym", "Gym", "Westfleur Centre gym (own use)", "water", false],
];

// Creates the tables on first use, so there is no separate migration step.
export async function db(attempt = 0) {
  const q = sql();
  ready ||= (async () => {
    await q`CREATE TABLE IF NOT EXISTS meters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      shop TEXT,
      tenant TEXT,
      type TEXT NOT NULL DEFAULT 'water',
      meter_no TEXT,
      is_main BOOLEAN NOT NULL DEFAULT false,
      recharge BOOLEAN NOT NULL DEFAULT true,
      active BOOLEAN NOT NULL DEFAULT true,
      sort INT NOT NULL DEFAULT 0
    )`;
    await q`CREATE TABLE IF NOT EXISTS readings (
      id SERIAL PRIMARY KEY,
      meter_id INT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      reading NUMERIC(14,4) NOT NULL,
      read_on DATE NOT NULL DEFAULT CURRENT_DATE,
      photo_url TEXT,
      read_by TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (meter_id, period)
    )`;
    await q`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL)`;
    const [{ n }] = await q`SELECT count(*)::int AS n FROM meters`;
    if (n === 0) {
      let i = 0;
      for (const [name, shop, tenant, type, isMain] of SEED_METERS) {
        const recharge = !isMain && !["Gym", "4"].includes(shop);
        await q`INSERT INTO meters (name, shop, tenant, type, is_main, recharge, sort)
                VALUES (${name}, ${shop}, ${tenant}, ${type}, ${isMain}, ${recharge}, ${i++})`;
      }
    }
    await q`INSERT INTO settings (key, value) VALUES ('tariffs', ${JSON.stringify(DEFAULT_TARIFFS)})
            ON CONFLICT (key) DO NOTHING`;
    await createTenantSchema(q);
    await createBillingSchema(q);
  })();
  try {
    await ready;
  } catch (e) {
    ready = null;
    // Another instance created the same table at the same moment: the table now exists, so start again once.
    if (attempt < 2 && (["23505", "42P07"].includes(e?.code) || /pg_type_typname_nsp_index|already exists/.test(e?.message || ""))) {
      await new Promise((r) => setTimeout(r, 300));
      return db(attempt + 1);
    }
    throw e;
  }
  return q;
}

export async function getTariffs() {
  const q = await db();
  const rows = await q`SELECT value FROM settings WHERE key = 'tariffs'`;
  return { ...DEFAULT_TARIFFS, ...(rows[0]?.value || {}) };
}
