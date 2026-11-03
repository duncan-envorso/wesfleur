import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await verifyToken((await cookies()).get(COOKIE)?.value);
  return Response.json(s || { user: null, role: null });
}
