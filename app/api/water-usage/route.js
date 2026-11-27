import { handle } from "@/lib/api";
import { waterUsage } from "@/lib/water-usage";

export const dynamic = "force-dynamic";

// GET /api/water-usage?from=YYYY-MM&to=YYYY-MM — admin only (see proxy.js).
export const GET = handle(async (req) => {
  const p = new URL(req.url).searchParams;
  return waterUsage(p.get("from"), p.get("to"));
});
