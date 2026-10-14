# Deployment security

## Current application surface

This repository is a static Vercel site (`index.html` and `gallery.html`) with a
single serverless endpoint, `api/application.js`, that receives the Akbar
Application form and delivers it by email to `info@royalakbar.ae`. There is no
authentication, registration, password reset, or admin route anywhere in the
project.

The endpoint is intentionally unauthenticated — it is a public application
form — so it is protected by input validation, a honeypot field, per-IP rate
limiting, and a hard request-size cap. See
[The Akbar Application endpoint](#the-akbar-application-endpoint) below.

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

## The Akbar Application endpoint

`api/application.js` is a Vercel Node serverless function mounted at
`/api/application`. The form on `index.html` posts JSON to it (and falls back to
a normal form POST for browsers without JavaScript).

### Controls already implemented in code

| Control | Implementation |
| --- | --- |
| Method restriction | Only `POST` is accepted; everything else returns `405` with an `Allow` header. |
| Request size | Bodies over 8 KB are rejected with `413` before parsing. |
| Content type | Only JSON and `application/x-www-form-urlencoded` are parsed; anything else gets `415`. |
| Schema validation | Name, email, and reason are validated server-side; `reason` is checked against an allow-list. Invalid input returns `422` with per-field errors. |
| Control-character stripping | C0 control characters are removed before the values are used, so form content cannot forge headers or log lines. |
| Bot honeypot | The hidden `company` field must be empty. Filled submissions are accepted silently and dropped, so bots receive no signal. |
| Rate limiting | 5 submissions per IP per hour by default (`APPLICATION_RATE_LIMIT`, `APPLICATION_RATE_WINDOW_MS`). `429` responses carry `Retry-After`. |
| Provider isolation | Mail is sent to the Resend API with an 8 second timeout. Provider failures return `502`/`504`/`429` and never expose the provider response body to the visitor. |
| No secret leakage | A missing `RESEND_API_KEY` returns `503` with a generic message; the configuration fault is logged, not returned. |
| Logging | Logs record only the outcome (`delivered`, `rate limited`, `honeypot tripped`, `delivery failed`) and a status code. **Submitted names, emails, and messages are never logged.** |
| Transport policy | `vercel.json` sets `no-store`, `nosniff`, and a CSP that allows `connect-src 'self'` and `form-action 'self'` only, so submissions cannot be redirected to a third party. |

### Required configuration in Vercel

Set these in the **royalakbar-deploy** project under *Settings > Environment
Variables* (Production, and Preview if you test there).

> **Environment variables only apply to new deployments.** After saving a
> variable, go to *Deployments → ⋯ → Redeploy* (or push a commit). Until you
> redeploy, the live site keeps the old value and submissions keep failing with
> `503`.

| Variable | Required | Default |
| --- | --- | --- |
| `RESEND_API_KEY` | **Yes** | — (the endpoint returns `503` without it) |
| `APPLICATION_TO_EMAIL` | No | `info@royalakbar.ae` |
| `APPLICATION_FROM_EMAIL` | No | `Royal Akbar Ritual <applications@royalakbar.ae>` |
| `APPLICATION_SUBJECT` | No | `New Akbar Application — {name}` |
| `APPLICATION_RATE_LIMIT` | No | `5` per IP per window |
| `APPLICATION_RATE_WINDOW_MS` | No | `3600000` (one hour) |
| `UPSTASH_REDIS_REST_URL` | Recommended | — (see rate limiting below) |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | — |

Mail is delivered through [Resend](https://resend.com). Before going live:

1. Add and verify the `royalakbar.ae` domain in Resend.
2. Publish the SPF, DKIM, and DMARC records Resend provides, and confirm the
   domain shows as *Verified*. Sending from an unverified domain will fail
   silently for recipients whose providers enforce DMARC.
3. Use a `RESEND_API_KEY` scoped to sending only. Rotate it if it is ever
   exposed; it is a bearer credential for your sending domain.
4. Send a real test submission and confirm it lands in the
   `info@royalakbar.ae` mailbox (check the spam folder first if it does not).

### Rate limiting: finish this step

The in-memory limiter keeps one counter per serverless instance, so the
effective limit is *5 per IP per hour per instance*. On a site that scales out,
that is a weak control. Set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` to move the counter into Redis, which makes the
limit hold across every instance. If Redis is unreachable the function fails
open to the in-memory counter rather than rejecting every submission.

The Cloudflare rate-limiting rule described above still applies to all
requests and remains the first line of defence against flooding.

### If more dynamic features are added later

Any future login, admin, registration, password-reset, or file-upload endpoint
must be implemented server-side with:

- authentication and role authorization on every request;
- explicit method and schema validation, small body limits, and request
  timeouts;
- route-specific, durable rate limiting (not in-memory state on Vercel);
- 401/403/404/405/413/429 responses that match the actual failure;
- privacy-conscious security event logging with defined retention.

Do not rely on hidden UI, client-side redirects, `robots.txt`, or User-Agent
matching to protect private data.
