import { handle } from "@/lib/api";
import { getTenant, updateTenant } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const d = await getTenant((await params).id);
  return d || Response.json({ error: "Tenant not found" }, { status: 404 });
});
export const PATCH = handle(async (req, { params }) => updateTenant((await params).id, await req.json()));
