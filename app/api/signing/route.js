import { currentUser, handle } from "@/lib/api";
import { createRequest, listRequests } from "@/lib/signing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => listRequests({ tenantId: new URL(req.url).searchParams.get("tenant") }));
export const POST = handle(async (req) => createRequest(await req.formData(), await currentUser()));
