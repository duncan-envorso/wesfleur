import { currentUser, handle } from "@/lib/api";
import { getCityBill, saveCityBill } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => getCityBill(new URL(req.url).searchParams.get("period")));
export const PUT = handle(async (req) => {
  const body = await req.json();
  return saveCityBill(body.period, body, await currentUser());
});
