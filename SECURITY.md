# Deployment security

## Current application surface

This repository is a static Vercel site (`index.html` and `gallery.html`). It
has no API endpoints, authentication, registrations, password resets, admin
routes, or server-side contact-form handler. The contact form is client-side
only and does not transmit submitted data. Consequently, there are no
application endpoints on which to add server-side rate limiting or audit logs.

`robots.txt` and `X-Robots-Tag` are deliberately set to `noindex`/`nofollow`.
They prevent cooperative crawlers from indexing the site, but are **not** a
security boundary. Anyone who knows the URL can still request a public static
file unless the following edge protection is enabled.

## Required Vercel control: private access

In the Vercel project **royalakbar-deploy**, enable **Deployment Protection**
for production. Select Vercel Authentication (team members) or Password
Protection (approved visitors). Verify that `https://royalakbar.ae/` returns
an access challenge before the site HTML is served. This is the only reliable
way to keep this static deployment private without redesigning it around an
authenticated backend.

Keep the custom domain attached only to the protected production deployment.
Do not expose a separate unprotected `.vercel.app` deployment.

## Required Cloudflare controls

Proxy the DNS records for `royalakbar.ae` through Cloudflare (orange cloud)
only after Vercel Deployment Protection is working. Then configure these
controls in the Cloudflare dashboard:

1. **Security > Bots**: enable Bot Fight Mode (or Super Bot Fight Mode on an
   eligible plan). If verified bots are not required, block them too; do not
   trust a User-Agent string as verification.
2. **Security > WAF > Managed rules**: enable Cloudflare Managed Ruleset and
   the OWASP Core Ruleset. Start in log/simulate mode, review events, then
   block confirmed attack traffic.
3. **Security > WAF > Custom rules**: block requests to known scanner paths
   (for example `/.env`, `/.git`, `/wp-admin`, `/wp-login.php`,
   `/phpmyadmin`, and `/cgi-bin`). Do not make a broad rule that blocks `/`.
4. **Security > WAF > Rate limiting rules**: set a conservative, per-IP rule
   for all requests (for example 60 requests per minute with a short block),
   then tune from Security Events. Static assets and normal browsing must be
   tested before tightening the threshold.
5. **Security > Settings**: enable Browser Integrity Check and set Security
   Level to Medium or High. Keep TLS mode at Full (strict).
6. **Security > Events**: retain and review only route, action/status,
   timestamp, IP-derived Cloudflare request ID, and rule ID. Never add form
   contents, cookies, authorization headers, or passwords to logs.

Cloudflare controls are intentionally not represented as a code file: WAF,
bot scoring, verified-bot detection, rate limiting, event retention, and
access challenges are account-level edge controls and cannot be securely
enforced by a static site.

## If dynamic features are added later

Any future `/api/*`, login, admin, registration, password-reset, or contact
submission endpoint must be implemented server-side with:

- authentication and role authorization on every request;
- explicit method and schema validation, small body limits, and request
  timeouts;
- route-specific, durable rate limiting (not in-memory state on Vercel);
- 400/401/403/404/405/413/429 responses that match the actual failure;
- privacy-conscious security event logging with defined retention.

Do not rely on hidden UI, client-side redirects, `robots.txt`, or User-Agent
matching to protect private data.
