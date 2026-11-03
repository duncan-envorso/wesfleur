import { getBilling, getInvoice } from "@/lib/billing";
import { invoicePdf } from "@/lib/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const inv = await getInvoice((await params).id);
    const bytes = await invoicePdf(inv, await getBilling());
    const name = `${inv.number || `DRAFT-${inv.id}`} ${inv.trading_name}`.replace(/[^\w .&-]/g, "").trim();
    const download = new URL(req.url).searchParams.get("download") === "1";
    return new Response(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
