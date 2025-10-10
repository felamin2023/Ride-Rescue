// supabase/functions/notify-verified/index.ts

// Minimal Deno shims so VS Code/TS won't error if the Deno extension isn't active.
// (Safe at runtime because the real Deno object exists in Edge Functions.)
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/* CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  to: string;        // recipient email (required)
  name?: string;     // contact person (optional)
  shopName?: string; // places.name (optional)
  loginUrl?: string; // optional CTA
};

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") ?? ""; // your verified single-sender email
const FROM_NAME = Deno.env.get("SENDGRID_FROM_NAME") ?? "RideRescue";

function esc(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!SENDGRID_API_KEY) return json({ ok: false, error: "SENDGRID_API_KEY not set" }, 500);
    if (!FROM_EMAIL) return json({ ok: false, error: "SENDGRID_FROM_EMAIL not set" }, 500);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const to = (body?.to ?? "").trim();
    const name = (body?.name ?? "there").trim();
    const shopName = (body?.shopName ?? "your shop").trim();
    const loginUrl = (body?.loginUrl ?? "").trim();

    if (!to) return json({ ok: false, error: "Missing 'to' email" }, 400);

    const subject = "Your shop account is now verified";
    const text =
      `Good day, ${name}!\n\n` +
      `Your shop "${shopName}" account is now verified.\n` +
      `You may now log in to your account. Have a nice day!\n` +
      (loginUrl ? `\nLog in: ${loginUrl}\n` : ``) +
      `\n— RideRescue`;

    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#0f172a">` +
      `<h2 style="margin:0 0 12px">You're verified 🎉</h2>` +
      `<p>Good day, ${esc(name)}!</p>` +
      `<p>Your shop "<strong>${esc(shopName)}</strong>" account is now verified.</p>` +
      `<p>You may now log in to your account. Have a nice day!</p>` +
      (loginUrl
        ? `<p style="margin-top:16px"><a href="${esc(loginUrl)}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none">Log in</a></p>`
        : ``) +
      `<p style="color:#64748b;font-size:12px;margin-top:18px">— RideRescue</p>` +
      `</div>`;

    const payload = {
      personalizations: [{ to: [{ email: to, name }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    };

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      return json({ ok: false, error: `SendGrid error: ${msg}` }, 500);
    }

    return json({ ok: true });
  } catch (err: any) {
    console.error("notify-verified error:", err);
    return json({ ok: false, error: String(err?.message ?? err) }, 500);
  }
});
