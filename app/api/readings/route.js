import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { parseReading } from "@/lib/calc";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const period = new URL(req.url).searchParams.get("period");
  if (!/^\d{4}-\d{2}$/.test(period || "")) return Response.json({ error: "period must be YYYY-MM" }, { status: 400 });
  try {
    return Response.json(await buildReport(period));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// multipart form: meter_id, period, reading, read_on, read_by, note, photo (file, optional)
export async function POST(req) {
  try {
    const q = await db();
    const form = await req.formData();
    const meterId = Number(form.get("meter_id"));
    const period = String(form.get("period") || "");
    const reading = parseReading(form.get("reading"));
    if (!meterId || !/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: "meter and period required" }, { status: 400 });
    if (!Number.isFinite(reading)) return Response.json({ error: "Enter the reading as a number, e.g. 0247,5018" }, { status: 400 });

    let photoUrl = null;
    const photo = form.get("photo");
    if (photo && typeof photo === "object" && photo.size > 0) {
      const blob = await put(`meters/${period}/meter-${meterId}.jpg`, photo, {
        access: "public",
        addRandomSuffix: true,
        contentType: photo.type || "image/jpeg",
      });
      photoUrl = blob.url;
    }
    const readOn = form.get("read_on") || new Date().toISOString().slice(0, 10);
    const readBy = form.get("read_by") || null;
    const note = form.get("note") || null;
    await q`
      INSERT INTO readings (meter_id, period, reading, read_on, photo_url, read_by, note)
      VALUES (${meterId}, ${period}, ${reading}, ${readOn}, ${photoUrl}, ${readBy}, ${note})
      ON CONFLICT (meter_id, period) DO UPDATE SET
        reading = EXCLUDED.reading,
        read_on = EXCLUDED.read_on,
        photo_url = COALESCE(EXCLUDED.photo_url, readings.photo_url),
        read_by = COALESCE(EXCLUDED.read_by, readings.read_by),
        note = EXCLUDED.note,
        created_at = now()`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  const q = await db();
  await q`DELETE FROM readings WHERE id = ${id}`;
  return Response.json({ ok: true });
}
