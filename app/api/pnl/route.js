import { handle } from "@/lib/api";
import { profitAndLoss } from "@/lib/pnl";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return profitAndLoss(u.get("to"), u.get("months"));
});
