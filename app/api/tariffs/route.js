import { db, getTariffs } from "@/lib/db";
import { DEFAULT_TARIFFS } from "@/lib/calc";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getTariffs());
}

export async function PUT(req) {
  const q = await db();
  const b = await req.json();
  const t = {};
  for (const k of Object.keys(DEFAULT_TARIFFS)) {
    if (k === "add_vat") t[k] = !!b[k];
    else if (Number.isFinite(Number(b[k]))) t[k] = Number(b[k]);
  }
  await q`INSERT INTO settings (key, value) VALUES ('tariffs', ${JSON.stringify(t)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return Response.json(await getTariffs());
}
