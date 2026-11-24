import { currentUser, handle } from "@/lib/api";
import { getRequest, requestAction } from "@/lib/signing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const originOf = (req) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

export const GET = handle(async (req, { params }) => getRequest((await params).id));
export const POST = handle(async (req, { params }) => requestAction((await params).id, await req.json(), await currentUser(), originOf(req)));
