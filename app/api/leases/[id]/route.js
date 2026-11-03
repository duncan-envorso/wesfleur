import { handle } from "@/lib/api";
import { updateLease } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req, { params }) => updateLease((await params).id, await req.json()));
