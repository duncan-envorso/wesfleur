import { handle } from "@/lib/api";
import { templateFile } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const f = await templateFile((await params).id);
  return new Response(f.bytes, { headers: { "content-type": "application/pdf", "cache-control": "private, no-store" } });
});
