import { handle } from "@/lib/api";
import { fileBytes, getRequest } from "@/lib/signing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const kind = new URL(req.url).searchParams.get("kind") === "signed" ? "signed" : "original";
  const { request: r } = await getRequest((await params).id);
  const id = kind === "signed" ? r.signed_file_id : r.original_file_id;
  if (!id) throw new Error("No signed copy yet");
  const f = await fileBytes(id);
  return new Response(f.bytes, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `inline; filename="${f.name.replace(/[^\w .()-]/g, "_")}"`,
    "cache-control": "private, no-store",
  } });
});
