import { handle } from "@/lib/api";
import { addEvent } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const POST = handle(async (req, { params }) => addEvent((await params).id, await req.json()));
