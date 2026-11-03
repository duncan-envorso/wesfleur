import { currentUser, handle } from "@/lib/api";
import { addPayment, listPayments } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => { const u = new URL(req.url).searchParams; return listPayments(u.get("tenant"), u.get("period")); });
export const POST = handle(async (req) => addPayment(await req.json(), await currentUser()));
