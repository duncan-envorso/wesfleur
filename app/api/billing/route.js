import { handle } from "@/lib/api";
import { getBilling, nextNumberPreview, saveBilling } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ({ ...(await getBilling()), next_number: await nextNumberPreview() }));
export const PUT = handle(async (req) => saveBilling(await req.json()));
