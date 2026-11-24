import { handle } from "@/lib/api";
import { clientMeta, declineAsSigner, publicView, sendCode, signAsSigner, verifyCode } from "@/lib/signing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async (req, { params }) => publicView((await params).token, clientMeta(req)));
export const POST = handle(async (req, { params }) => {
  const token = (await params).token;
  const body = await req.json();
  const meta = clientMeta(req);
  if (body.action === "code") return sendCode(token, meta);
  if (body.action === "verify") return verifyCode(token, body.code, meta);
  if (body.action === "sign") return signAsSigner(token, body, meta);
  if (body.action === "decline") return declineAsSigner(token, body.reason, meta);
  throw new Error("Unknown action");
});
