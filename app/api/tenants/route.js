import { handle } from "@/lib/api";
import { createTenant, listTenants } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const GET = handle(() => listTenants());
export const POST = handle(async (req) => ({ id: await createTenant(await req.json()) }));
