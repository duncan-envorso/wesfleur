import { currentUser, handle } from "@/lib/api";
import { listExpenses, saveExpense } from "@/lib/expenses";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const u = new URL(req.url).searchParams;
  return listExpenses({ period: u.get("period"), category: u.get("category") });
});
export const POST = handle(async (req) => saveExpense(await req.formData(), await currentUser()));
