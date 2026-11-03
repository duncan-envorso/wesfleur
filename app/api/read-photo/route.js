// Optional: reads the digits off a meter photo with Claude. Needs ANTHROPIC_API_KEY.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ enabled: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 400 });
  const form = await req.formData();
  const photo = form.get("photo");
  if (!photo || typeof photo !== "object") return Response.json({ error: "photo required" }, { status: 400 });
  const data = Buffer.from(await photo.arrayBuffer()).toString("base64");
  const type = form.get("type") === "electricity" ? "electricity" : "water";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: photo.type || "image/jpeg", data } },
          {
            type: "text",
            text: type === "water"
              ? "This is a South African water meter. Read the register. Black/white digits are kilolitres; red digits or dials are fractions of a kilolitre. Reply with JSON only: {\"reading\": \"0247,5018\", \"confidence\": \"high|medium|low\", \"note\": \"...\"} using a comma between the kilolitre and fraction digits."
              : "This is an electricity meter. Read the kWh register. Reply with JSON only: {\"reading\": \"12345,6\", \"confidence\": \"high|medium|low\", \"note\": \"...\"}.",
          },
        ],
      }],
    }),
  });
  const body = await res.json();
  if (!res.ok) return Response.json({ error: body?.error?.message || "Reading failed" }, { status: 502 });
  const text = body.content?.map((c) => c.text || "").join("") || "";
  try {
    return Response.json(JSON.parse(text.match(/\{[\s\S]*\}/)[0]));
  } catch {
    return Response.json({ error: "Could not read the meter", raw: text }, { status: 422 });
  }
}
