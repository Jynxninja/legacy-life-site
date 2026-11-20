# Put the site live (Netlify + GoDaddy) — about 15 minutes

Booking (Supabase + Resend) is a separate step, in SETUP.md. This gets the website itself online.

NOTE: until booking is connected, the "Book an Interview" / "Book a Free Consultation" buttons open the form but fail at the time-picking step with "We couldn't load open times." That's expected for now.

## 1. Publish on Netlify
1. Go to app.netlify.com and sign up / log in (free plan is fine).
2. **Add new site → Deploy manually.**
3. Unzip this package, then drag the **`site`** folder (the one containing index.html) onto the page.
4. In ~30 seconds you get a address like `random-name-12345.netlify.app`. Open it and click around to confirm it looks right.
5. **Site configuration → Change site name** → pick something clean (this becomes your `<name>.netlify.app` address, which you need for step 3).

## 2. Add your domain in Netlify
**Domain management → Add a domain** → type your domain (e.g. `yourdomain.com`) → Verify → Add. Netlify adds both `yourdomain.com` and `www.yourdomain.com`.

## 3. Point GoDaddy at Netlify
GoDaddy → **My Products → your domain → DNS** (Manage DNS). Edit the records so you have exactly these:

| Type | Name | Value |
|---|---|---|
| A | `@` | `75.2.60.5` |
| CNAME | `www` | `<your-site-name>.netlify.app` |

Watch out for these GoDaddy gotchas:
- There's usually an existing **A record for `@` pointing to "Parked"** — edit it (or delete it and add the new one). Two competing A records = broken site.
- There's usually an existing **CNAME for `www` pointing to `@`** — change its value to your Netlify address.
- If **Domain Forwarding** is turned on (GoDaddy → domain → Forwarding), turn it off.
- Leave any records you don't recognise for email (MX, TXT) alone.

Source for the values: Netlify's "Configure external DNS" docs (docs.netlify.com). Netlify says it can take several hours, up to a day, to spread.

## 4. Turn on HTTPS
Back in Netlify → **Domain management → HTTPS → Verify DNS / Provision certificate**. Once DNS has spread, the padlock appears. Then turn on **Force HTTPS**. Make `yourdomain.com` (without www) or `www` the "primary domain" — whichever you want people to see; Netlify redirects the other.

## 5. Updating the site later
Netlify → your site → **Deploys** → drag a new `site` folder onto it.



## What I changed for launch
- Removed the placeholder "Agent Name" card and the note about it from Meet the Team.
- Removed "Placeholder mission copy" and "not a licensed insurer" from the footer, and removed the fake "Licensed in [ States ] · NPN [ 0000000 ]" line. **You still need to add your real licensing info to the footer.** Insurance sites are expected to show it.
- The team page shows @legacylife.com emails publicly. If those mailboxes don't exist yet, create them or tell me the real ones.
