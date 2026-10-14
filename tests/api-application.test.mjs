import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test, { afterEach, before, beforeEach } from "node:test";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const handler = require("../api/application.js");

/** Minimal Vercel-style req/res pair backed by a string body. */
function makeRequest({ method = "POST", body = "", headers = {}, url = "/api/application" } = {}) {
  const buffer = Buffer.from(body);
  const req = Object.assign(
    buffer.length
      ? Readable.from([buffer])
      : Object.assign(Readable.from((async function* () {})()), { destroy() {} }),
    { method, url, headers, socket: { remoteAddress: "10.0.0.1" } },
  );
  const res = {
    statusCode: 200,
    headers: Object.create(null),
    body: "",
    ended: false,
    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk !== undefined) this.body += chunk;
      this.ended = true;
    },
  };
  return { req, res };
}

function json(body, headers = {}) {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  };
}

function form(body, headers = {}) {
  return {
    method: "POST",
    body: new URLSearchParams(body).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  };
}

const VALID = {
  name: "Amina Al Mansouri",
  email: "amina@example.com",
  reason: "akbar-application",
  message: "Requesting documentation for the heritage programme.",
};

/** Captures the outgoing Resend request instead of calling the network. */
function stubProvider(response) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const result = typeof response === "function" ? response(calls.length) : response;
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.json ?? {},
      text: async () => result.text ?? "",
    };
  };
  return calls;
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

before(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.APPLICATION_TO_EMAIL = "info@royalakbar.ae";
  process.env.APPLICATION_FROM_EMAIL = "Royal Akbar Ritual <applications@royalakbar.ae>";
  process.env.APPLICATION_RATE_LIMIT = "5";
});

beforeEach(() => {
  handler.resetRateLimit();
  globalThis.fetch = async () => {
    throw new Error("network disabled; stub the provider");
  };
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

test("rejects every method except POST", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) {
    const { req, res } = makeRequest({ method });
    await handler(req, res);
    assert.equal(res.statusCode, 405, `${method} should not be allowed`);
    assert.equal(res.headers.allow, "POST");
  }
});

test("rejects a body larger than the 8 KB limit", async () => {
  const { req, res } = makeRequest(json({ ...VALID, message: "x".repeat(9 * 1024) }));
  await handler(req, res);
  assert.equal(res.statusCode, 413);
});

test("rejects malformed JSON with 400 and no provider call", async () => {
  const calls = stubProvider({ status: 200 });
  const { req, res } = makeRequest({ body: "{not json", headers: { "content-type": "application/json" } });
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

test("rejects an unsupported content type", async () => {
  const { req, res } = makeRequest({ body: "hello", headers: { "content-type": "text/plain" } });
  await handler(req, res);
  assert.equal(res.statusCode, 415);
});

test("validates required fields without contacting the provider", async () => {
  const calls = stubProvider({ status: 200 });
  const { req, res } = makeRequest(
    json({ name: "A", email: "not-an-email", reason: "spam", message: "" }, { "x-forwarded-for": nextIp() }),
  );
  await handler(req, res);
  assert.equal(res.statusCode, 422);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, false);
  assert.ok(body.errors.name && body.errors.email && body.errors.reason);
  assert.equal(calls.length, 0);
});

test("trims control characters and caps field lengths", () => {
  const { errors, data } = handler.validate({
    name: "AminaAl Mansouri",
    email: "  AMINA@Example.ae  ",
    reason: "other",
    message: "y".repeat(5000),
  });
  assert.deepEqual(errors, {});
  assert.equal(data.name, "Amina Al Mansouri");
  assert.equal(data.email, "AMINA@Example.ae");
  assert.equal(data.message.length, 2000);
});

test("emails a valid submission to info@royalakbar.ae with a reply-to", async () => {
  const calls = stubProvider({ status: 200, json: { id: "msg_1" } });
  const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": nextIp() }));
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_key");

  const message = calls[0].body;
  assert.deepEqual(message.to, ["info@royalakbar.ae"]);
  assert.equal(message.from, "Royal Akbar Ritual <applications@royalakbar.ae>");
  assert.equal(message.reply_to, VALID.email);
  assert.match(message.subject, /Amina Al Mansouri/);
  assert.match(message.text, /Reason: {4}Akbar Application/);
  assert.match(message.text, /Requesting documentation/);
});

test("drops honeypot submissions silently without sending mail", async () => {
  const calls = stubProvider({ status: 200 });
  const { req, res } = makeRequest(json({ ...VALID, company: "bot" }, { "x-forwarded-for": nextIp() }));
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 0);
});

test("rate limits repeated submissions from one IP", async () => {
  stubProvider({ status: 200 });
  const ip = nextIp();
  for (let i = 0; i < 5; i += 1) {
    const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": ip }));
    await handler(req, res);
    assert.equal(res.statusCode, 200, `submission ${i + 1} should pass`);
  }
  const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": ip }));
  await handler(req, res);
  assert.equal(res.statusCode, 429);
  assert.match(res.headers["retry-after"], /^\d+$/);
  assert.equal(JSON.parse(res.body).error, "rate_limited");
});

test("rate limiting is per IP", async () => {
  stubProvider({ status: 200 });
  const ip = nextIp();
  for (let i = 0; i < 5; i += 1) {
    const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": ip }));
    await handler(req, res);
  }
  const other = makeRequest(json(VALID, { "x-forwarded-for": nextIp() }));
  await handler(other.req, other.res);
  assert.equal(other.res.statusCode, 200);
});

test("uses the durable Redis limiter when Upstash is configured", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.APPLICATION_RATE_LIMIT = "2";

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => [{ result: 5 }, { result: 1 }],
      text: async () => "",
    };
  };

  const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": nextIp() }));
  await handler(req, res);

  assert.equal(res.statusCode, 429, "counter above the limit must be refused");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/pipeline$/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer token");
  const commands = JSON.parse(calls[0].init.body);
  assert.equal(commands[0][0], "INCR");
  assert.match(commands[0][1], /^akbar-application:/);

  process.env.APPLICATION_RATE_LIMIT = "5";
});

test("returns 502 when the mail provider fails", async () => {
  stubProvider({ status: 500, text: "upstream boom" });
  const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": nextIp() }));
  await handler(req, res);
  assert.equal(res.statusCode, 502);
  assert.match(JSON.parse(res.body).error, /info@royalakbar\.ae/, "visitors get an actionable message");
});

test("returns 503 when RESEND_API_KEY is missing", async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const calls = stubProvider({ status: 200 });
  try {
    const { req, res } = makeRequest(json(VALID, { "x-forwarded-for": nextIp() }));
    await handler(req, res);
    assert.equal(res.statusCode, 503);
    assert.doesNotMatch(res.body, /RESEND/, "configuration details must not be exposed");
    assert.equal(calls.length, 0);
  } finally {
    process.env.RESEND_API_KEY = saved;
  }
});

test("no-JS submissions are answered with a redirect, not JSON", async () => {
  stubProvider({ status: 200 });
  const { req, res } = makeRequest(form(VALID, { "x-forwarded-for": nextIp() }));
  await handler(req, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, "/?application=received#contact");
  assert.equal(res.headers["cache-control"], "no-store");
});

test("endpoint never logs submitted form content", async () => {
  const source = await readFile(new URL("api/application.js", root), "utf8");
  assert.doesNotMatch(source, /console\.(log|warn|info)\([^)]*(data|message|name|email)/i);
  assert.match(source, /console\.log\('\[application\] delivered to', cfg\.to\)/);
});

test("translations cover the form status keys in every language", async () => {
  const source = await readFile(new URL("translations.js", root), "utf8");
  const stub = { translations: undefined };
  new Function("window", source)(stub);
  const dict = stub.translations;
  const keys = ["formSending", "formReceived", "formSuccess", "formError", "formInvalid", "formRateLimit"];
  assert.ok(Object.keys(dict).length >= 30);
  for (const [lang, entries] of Object.entries(dict)) {
    for (const key of keys) {
      assert.equal(typeof entries[key], "string", `${lang}.${key} is missing`);
      assert.ok(entries[key].length > 0, `${lang}.${key} is empty`);
    }
  }
});
