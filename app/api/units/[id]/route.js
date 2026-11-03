import { handle } from "@/lib/api";
import { updateUnit } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req, { params }) => updateUnit((await params).id, await req.json()));
