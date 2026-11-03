import { currentUser, handle } from "@/lib/api";
import { balances, getBilling, issueAll, listInvoices, nextNumberPreview, prepareDrafts, refreshAllDrafts } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const period = new URL(req.url).searchParams.get("period");
  if (!/^\d{4}-\d{2}$/.test(period || "")) throw new Error("period must be YYYY-MM");
  const billing = await getBilling();
  return {
    period,
    invoices: await listInvoices(period),
    balances: await balances(),
    nextNumber: `${billing.prefix}${String(await nextNumberPreview()).padStart(7, "0")}`,
    vatFrom: billing.vat_registered_from || null,
  };
});

export const POST = handle(async (req) => {
  const { action, period } = await req.json();
  const user = await currentUser();
  if (action === "prepare") return prepareDrafts(period, user);
  if (action === "refresh-all") return refreshAllDrafts(period);
  if (action === "issue-all") return { issued: await issueAll(period, user) };
  throw new Error("Unknown action");
});
