import { currentUser, handle } from "@/lib/api";
import { createFromTemplate, createTemplate, listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async () => listTemplates());
// multipart (file) = new template; JSON { action: "make", ... } = make a lease from a template
export const POST = handle(async (req) => {
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) return createTemplate(await req.formData(), await currentUser());
  const body = await req.json();
  if (body.action === "make") return createFromTemplate(body, await currentUser());
  throw new Error("Unknown action");
});
