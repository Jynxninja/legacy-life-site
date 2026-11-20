# Legacy Life Group — go-live guide

Three services, about 45 minutes the first time:
**Supabase** (stores bookings, runs the booking function) · **Resend** (sends the alert emails) · **Netlify** (hosts the site on your domain).

The website never touches the database directly. It only talks to one function (`booking`), which checks everything, blocks double-bookings, saves the booking, and emails the agent.

---

## 1. Supabase — database

1. Open your project → **SQL Editor** → New query.
2. Paste all of `supabase/schema.sql` → **Run**. (Safe to run twice.)
3. Open **Table Editor → agents** and set each person's REAL email. The seed uses `firstname.lastname@legacylife.com` — if those mailboxes don't exist, alerts go nowhere.
4. Optional: **availability** holds each agent's hours (weekday 0=Sun … 6=Sat, start_hour/end_hour in 24h). Default is Mon–Fri, 9–17. Delete a row to make that day unavailable.

## 2. Resend — email

1. Create an account at resend.com → **Domains** → add your domain → add the DNS records it shows at your domain registrar → wait for "Verified".
2. **API Keys** → create one. Keep it private.
3. Pick a sender, e.g. `Legacy Life Bookings <bookings@yourdomain.com>`. It must be on the verified domain, or Resend will reject it.

## 3. Supabase — deploy the function

Dashboard route (no install): **Edge Functions → Deploy a new function → via Editor**, name it exactly `booking`, paste `supabase/functions/booking/index.ts`, and add a second file `slots.ts` with the contents of `supabase/functions/booking/slots.ts`. **Turn OFF "Verify JWT"** for this function (the site is public).

CLI route:
```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy booking --no-verify-jwt
```

Then **Edge Functions → Secrets** (or `supabase secrets set ...`):

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | key from step 2 |
| `MAIL_FROM` | `Legacy Life Bookings <bookings@yourdomain.com>` |
| `OWNER_EMAIL` | Aaron's email (gets a BCC of every booking) |
| `AGENCY_TZ` | e.g. `America/New_York` — the timezone your agents' hours are in |
| `ALLOWED_ORIGIN` | `*` for now; after launch set to `https://yourdomain.com` |

Never put the `service_role` key anywhere except Supabase's own secrets, and never in the website.

## 4. Connect the website

Open `site/index.html`, search for `BOOKING_API`, and replace the placeholder with:

`https://YOUR-PROJECT-REF.supabase.co/functions/v1/booking`

(Project ref = the first part of your Supabase Project URL.)

## 5. Netlify — publish

1. app.netlify.com → **Add new site → Deploy manually** → drag the `site` folder in.
2. **Domain management → Add a domain** → follow Netlify's DNS instructions at your registrar (either point nameservers to Netlify, or add the A/CNAME records it gives you). HTTPS is automatic.
3. Go back to Supabase and change `ALLOWED_ORIGIN` to your real `https://` domain.

To update the site later: drag a new `site` folder onto the site's **Deploys** tab.

## 6. Test it for real

On the live domain: Get a Policy → Book a Free Consultation → pick an agent → book a time. You should see the confirmation, the agent (and owner) should get the email, and that time should be gone when you reopen the picker. Check **Table Editor → bookings** for the row. Also test **Book an Interview**.

If the time list says "We couldn't load open times": the function URL is wrong or the function isn't deployed. Check **Edge Functions → booking → Logs**.

---

## Managing bookings
- **Cancel / free up a time:** in `bookings`, change `status` from `booked` to `cancelled`. Don't delete the row.
- **Block off a day:** easiest is to insert a placeholder booking row for that agent/time, or ask me to add a time-off table.
- If `emailed` is `false` on a row, the booking saved but the email failed (check Resend). The agent won't know unless you look at the table.

## Before you launch — don't skip
1. **Footer legal text** is still placeholder ("Licensed in [ States ] · NPN [ 0000000 ]", "not a licensed insurer"). Insurance sites need accurate license states/NPN. Fix it.
2. **Privacy Policy.** You're collecting phone numbers and dates of birth. Publish a policy and link it in the footer. Have someone qualified review it.
3. **DOB goes in the alert email.** Email isn't secure. If that bothers you, remove DOB from the email and read it from the table instead.
4. The last team card is still a placeholder; fill it or remove it.
5. Visitors don't give an email, so they only get an on-screen confirmation. Agents have to call.
6. There's no rate limiting beyond a hidden honeypot field. Fine for launch; if you get spam bookings, add Cloudflare Turnstile.
