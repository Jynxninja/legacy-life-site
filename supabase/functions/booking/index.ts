// Supabase Edge Function: booking
// The website talks ONLY to this function. It checks everything server-side, saves the
// booking with the service-role key (the public key can't touch the tables), and emails the agent.
//
// Secrets (set in Supabase, see SETUP.md):
//   RESEND_API_KEY   - from resend.com
//   MAIL_FROM        - e.g. "Legacy Life Bookings <bookings@yourdomain.com>" (domain verified in Resend)
//   OWNER_EMAIL      - gets a copy (BCC) of every alert
//   AGENCY_TZ        - IANA zone for appointment hours, e.g. America/New_York
//   ALLOWED_ORIGIN   - your site, e.g. https://yourdomain.com  (defaults to * while testing)
//   SITE_NAME        - optional, defaults to "Legacy Life Group"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { generateSlots } from "./slots.ts";

const TZ = Deno.env.get("AGENCY_TZ") ?? "America/New_York";
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const SITE = Deno.env.get("SITE_NAME") ?? "Legacy Life Group";
const MIN_NOTICE_HOURS = 12;
const HORIZON_DAYS = 3; // calendar days scanned; the real cap is MAX_ADVANCE_HOURS
const MAX_ADVANCE_HOURS = 48; // can only book up to two days ahead

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function when(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(ms));
}

async function openSlots(agentId: string) {
  const { data: agent } = await db.from("agents").select("id,name,email").eq("id", agentId).eq("active", true).maybeSingle();
  if (!agent) return { agent: null, slots: [] as number[] };
  const { data: av } = await db.from("availability").select("weekday,start_hour,end_hour").eq("agent_id", agent.id);
  const all = generateSlots({ now: Date.now(), tz: TZ, availability: av ?? [], days: HORIZON_DAYS, minNoticeHours: MIN_NOTICE_HOURS, maxAdvanceHours: MAX_ADVANCE_HOURS });
  const { data: taken } = await db.from("bookings").select("slot_start").eq("agent_id", agent.id).eq("status", "booked")
    .gte("slot_start", new Date().toISOString());
  const takenSet = new Set((taken ?? []).map((r: { slot_start: string }) => new Date(r.slot_start).getTime()));
  return { agent, slots: all.filter((ms) => !takenSet.has(ms)) };
}

async function sendAlert(agent: { name: string; email: string }, b: Record<string, unknown>, slotMs: number) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) { console.error("Email not configured (RESEND_API_KEY / MAIL_FROM)"); return false; }
  const isInterview = b.kind === "interview";
  const label = isInterview ? "Interview" : "Consultation";
  const rows: [string, string][] = [
    ["Type", label],
    ["When", when(slotMs)],
    ["Name", String(b.name)],
    ["Phone", String(b.phone)],
    isInterview ? ["Licensed", b.licensed ? "Yes" : "Not yet"] : ["Date of birth", String(b.dob)],
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
    <h2 style="margin:0 0 4px">New ${esc(label.toLowerCase())} booked</h2>
    <p style="color:#555;margin:0 0 16px">Someone just booked time with you on the ${esc(SITE)} website.</p>
    <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
      `<tr><td style="padding:8px 12px;border:1px solid #ddd;background:#f6f3ea;width:130px"><b>${esc(k)}</b></td><td style="padding:8px 12px;border:1px solid #ddd">${esc(v)}</td></tr>`).join("")}</table>
    <p style="color:#555;margin-top:16px">Call or text ${esc(b.name)} to confirm. To free this time, set the booking's status to "cancelled" in Supabase.</p>
  </div>`;
  const owner = Deno.env.get("OWNER_EMAIL");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [agent.email], ...(owner && owner !== agent.email ? { bcc: [owner] } : {}),
      subject: `New ${label.toLowerCase()}: ${b.name} - ${when(slotMs)}`, html,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  try {
    // ---- list open times ----
    if (b.action === "slots") {
      const { agent, slots } = await openSlots(String(b.agent ?? ""));
      if (!agent) return json({ error: "unknown_agent" }, 404);
      return json({ tz: TZ, slots: slots.map((ms) => new Date(ms).toISOString()) });
    }

    // ---- make a booking ----
    if (b.action === "book") {
      if (b.website) return json({ ok: true }); // honeypot: bots fill this in, people never see it

      const kind = b.kind;
      if (kind !== "interview" && kind !== "consult") return json({ error: "invalid", field: "kind" }, 400);
      const name = String(b.name ?? "").trim();
      if (name.length < 2 || name.length > 100) return json({ error: "invalid", field: "name" }, 400);
      const phone = String(b.phone ?? "").trim();
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15 || phone.length > 30) return json({ error: "invalid", field: "phone" }, 400);

      let licensed: boolean | null = null;
      let dob: string | null = null;
      if (kind === "interview") {
        if (typeof b.licensed !== "boolean") return json({ error: "invalid", field: "licensed" }, 400);
        licensed = b.licensed;
      } else {
        const s = String(b.dob ?? "");
        const t = Date.parse(s + "T00:00:00Z");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(t) || t > Date.now() || t < Date.UTC(1900, 0, 1) ||
            new Date(t).toISOString().slice(0, 10) !== s) return json({ error: "invalid", field: "dob" }, 400);
        dob = s;
      }

      const slotMs = Date.parse(String(b.slot ?? ""));
      const { agent, slots } = await openSlots(String(b.agent ?? ""));
      if (!agent) return json({ error: "unknown_agent" }, 404);
      if (Number.isNaN(slotMs) || !slots.includes(slotMs)) return json({ error: "slot_taken" }, 409);

      const { data: row, error } = await db.from("bookings").insert({
        agent_id: agent.id, kind, slot_start: new Date(slotMs).toISOString(), name, phone, licensed, dob,
      }).select("id").single();
      if (error) {
        if (error.code === "23505") return json({ error: "slot_taken" }, 409); // someone beat them to it
        console.error("insert failed", error);
        return json({ error: "server" }, 500);
      }

      const sent = await sendAlert(agent, { kind, name, phone, licensed, dob }, slotMs);
      if (sent) await db.from("bookings").update({ emailed: true }).eq("id", row.id);

      return json({ ok: true, agent: agent.name, slot: new Date(slotMs).toISOString(), tz: TZ });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
