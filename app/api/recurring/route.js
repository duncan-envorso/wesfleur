import { currentUser, handle } from "@/lib/api";
import { markPaid, monthlyCosts, saveRecurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return monthlyCosts({ months: u.get("months") || 6 });
});
// { action: "paid", id, period } records a payment; anything else creates a recurring cost.
export const POST = handle(async (req) => {
  const body = await req.json();
  if (body.action === "paid") return markPaid(body.id, body.period, await currentUser());
  return saveRecurring(body);
});
