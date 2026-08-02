import { EmailMessage } from "cloudflare:email";

const ORIGIN = "https://sidelinehero.tommamakesthings.com";
const FROM = "beta@tommamakesthings.com";
const TO = "thomas.morris@gmail.com";

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s,
  headers: Object.assign({ "Content-Type": "application/json" }, cors)
});

// Permissive on purpose: rejecting a real address loses a beta tester,
// while letting a fake one through costs nothing.
const ok = (s) => typeof s === "string" && s.length <= 254 &&
  /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);

function mime(email, note) {
  const lines = [
    "From: Sideline Hero beta <" + FROM + ">",
    "To: <" + TO + ">",
    "Reply-To: <" + email + ">",
    "Subject: Beta request: " + email,
    "Message-ID: <" + crypto.randomUUID() + "@tommamakesthings.com>",
    "Date: " + new Date().toUTCString(),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Email: " + email
  ];
  if (note) lines.push("Note:  " + note);
  lines.push("", "Sent by the Sideline Hero beta form.");
  return lines.join("\r\n");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let d;
    try {
      const ct = request.headers.get("content-type") || "";
      d = ct.includes("application/json") ? await request.json()
        : Object.fromEntries(await request.formData());
    } catch (e) { return json({ error: "Could not read that submission." }, 400); }
    // Honeypot. Return success so a bot learns nothing from the difference.
    if (d._gotcha) return json({ ok: true });
    const email = (d.email || "").trim();
    if (!ok(email)) return json({ error: "That does not look like an email address." }, 400);
    const note = typeof d.note === "string" ? d.note.slice(0, 500) : "";
    try {
      await env.EMAIL.send(new EmailMessage(FROM, TO, mime(email, note)));
    } catch (err) {
      console.error("send failed", err && err.message);
      return json({ error: "Could not send that just now. Please email support@tommamakesthings.com." }, 502);
    }
    return json({ ok: true });
  }
};
