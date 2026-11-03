import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  const { id } = await params;
  const q = await db();
  const b = await req.json();
  const [row] = await q`
    UPDATE meters SET
      name = COALESCE(${b.name ?? null}, name),
      shop = COALESCE(${b.shop ?? null}, shop),
      tenant = COALESCE(${b.tenant ?? null}, tenant),
      type = COALESCE(${b.type ?? null}, type),
      meter_no = COALESCE(${b.meter_no ?? null}, meter_no),
      is_main = COALESCE(${b.is_main ?? null}, is_main),
      recharge = COALESCE(${b.recharge ?? null}, recharge),
      active = COALESCE(${b.active ?? null}, active)
    WHERE id = ${Number(id)} RETURNING *`;
  return Response.json(row);
}
