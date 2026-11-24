import { handle } from "@/lib/api";
import { publicDocument } from "@/lib/signing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const kind = new URL(req.url).searchParams.get("kind") === "signed" ? "signed" : "original";
  const f = await publicDocument((await params).token, kind);
  return new Response(f.bytes, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `${new URL(req.url).searchParams.get("download") ? "attachment" : "inline"}; filename="${f.name.replace(/[^\w .()-]/g, "_")}"`,
    "cache-control": "private, no-store",
  } });
});
