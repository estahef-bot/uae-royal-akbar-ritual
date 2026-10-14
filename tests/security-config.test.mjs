import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("private crawler policy blocks all cooperative crawlers", async () => {
  const robots = await readFile(new URL("robots.txt", root), "utf8");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/\s*$/m);
});

test("Vercel headers deny indexing and reduce browser attack surface", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  const headers = Object.fromEntries(
    config.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );
  assert.match(headers["x-robots-tag"], /noindex/);
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["cache-control"], "private, no-store, max-age=0");
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  // The Akbar Application posts to /api/application on the same origin, so
  // 'self' is the tightest connect-src and form-action that still works.
  assert.match(headers["content-security-policy"], /connect-src 'self'/);
  assert.match(headers["content-security-policy"], /form-action 'self'/);
  assert.doesNotMatch(headers["content-security-policy"], /'unsafe-inline'/);
});

test("the Akbar Application form posts to the same-origin endpoint only", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const form = html.match(/<form class="contact-form"[\s\S]*?<\/form>/);
  assert.ok(form, "contact form is present");
  assert.match(form[0], /action="\/api\/application"/);
  assert.match(form[0], /method="post"/);
  assert.doesNotMatch(form[0], /action="https?:\/\//, "submissions must not leave the origin");
  assert.match(form[0], /name="company"/, "honeypot field catches bots");
  assert.match(form[0], /id="form-status"/);
});
