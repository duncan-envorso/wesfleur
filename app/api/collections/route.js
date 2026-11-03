import { handle } from "@/lib/api";
import { collections } from "@/lib/billing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => collections(new URL(req.url).searchParams.get("period")));
