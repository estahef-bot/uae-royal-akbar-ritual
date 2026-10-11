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
  assert.match(headers["content-security-policy"], /connect-src 'none'/);
});
