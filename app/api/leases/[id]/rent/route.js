import { handle } from "@/lib/api";
import { changeRent } from "@/lib/tenants";

export const dynamic = "force-dynamic";

export const POST = handle(async (req, { params }) => changeRent((await params).id, await req.json()));
