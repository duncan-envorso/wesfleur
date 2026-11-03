import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const q = await db();
  return Response.json(await q`SELECT * FROM meters ORDER BY sort, id`);
}

export async function POST(req) {
  const q = await db();
  const b = await req.json();
  if (!b.name) return Response.json({ error: "name required" }, { status: 400 });
  const [{ next }] = await q`SELECT COALESCE(max(sort), 0) + 1 AS next FROM meters`;
  const [row] = await q`
    INSERT INTO meters (name, shop, tenant, type, meter_no, is_main, recharge, sort)
    VALUES (${b.name}, ${b.shop || null}, ${b.tenant || null}, ${b.type === "electricity" ? "electricity" : "water"},
            ${b.meter_no || null}, ${!!b.is_main}, ${b.recharge !== false}, ${next})
    RETURNING *`;
  return Response.json(row);
}
