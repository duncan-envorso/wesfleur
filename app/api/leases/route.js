import { handle } from "@/lib/api";
import { createLease } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => ({ id: await createLease(await req.json()) }));
