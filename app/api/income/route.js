import { currentUser, handle } from "@/lib/api";
import { listIncome, saveIncome } from "@/lib/income";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return listIncome({ period: u.get("period"), category: u.get("category") });
});
export const POST = handle(async (req) => saveIncome(await req.json(), await currentUser()));
