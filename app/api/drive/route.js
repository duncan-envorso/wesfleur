import { handle } from "@/lib/api";
import { disconnect, driveStatus } from "@/lib/drive";
import { mailEnabled, mailFrom } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ({ drive: await driveStatus(), mail: { enabled: mailEnabled(), from: mailFrom() } }));
export const DELETE = handle(async () => { await disconnect(); return { ok: true }; });
