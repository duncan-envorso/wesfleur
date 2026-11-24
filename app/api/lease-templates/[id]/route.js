import { handle } from "@/lib/api";
import { getTemplate, prefill, updateTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const id = (await params).id;
  const u = new URL(req.url).searchParams;
  if (u.get("tenant")) return prefill(id, u.get("tenant"), u.get("lease"));
  return getTemplate(id);
});
export const PUT = handle(async (req, { params }) => updateTemplate((await params).id, await req.json()));
