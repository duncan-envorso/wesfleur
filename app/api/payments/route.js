import { currentUser, handle } from "@/lib/api";
import { addPayment, listPayments } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => listPayments(new URL(req.url).searchParams.get("tenant")));
export const POST = handle(async (req) => addPayment(await req.json(), await currentUser()));
