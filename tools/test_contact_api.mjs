// Local smoke test for the contact handler. Not part of the deployment.
// Copies api/contact.js to .mjs so it can be imported without a package.json
// rewrite, then drives it with stub req/res objects.
//
// The handler now records the enquiry in the backend first (so the admin
// dashboard can answer it) and only falls back to email when the backend is
// unreachable. These tests stub `fetch` to drive each path.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The copy must live inside the project so bare imports such as `nodemailer`
// resolve against node_modules.
const TMP = new URL("./.contact_under_test.mjs", import.meta.url);
writeFileSync(TMP, readFileSync(new URL("../api/contact.js", import.meta.url), "utf8"));
const { default: handler } = await import(pathToFileURL(TMP.pathname).href);

const BACKEND_URL = "https://backend.test/api/contact";
process.env.BACKEND_CONTACT_URL = BACKEND_URL;

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

async function call(body, { method = "POST", origin, ip = "1.2.3.4" } = {}) {
  const req = {
    method,
    body,
    headers: {
      host: "coopvest-website.vercel.app",
      ...(origin ? { origin } : {}),
      "x-forwarded-for": ip,
    },
    socket: { remoteAddress: ip },
  };
  const res = makeRes();
  await handler(req, res);
  return res;
}

const valid = {
  name: "Ada Okonkwo",
  email: "ada@example.com",
  phone: "+234 800 000 0000",
  topic: "Join by Direct Deposit (pay myself)",
  message: "I would like to know how to enrol my staff and join as a member.",
  website: "",
};

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!condition) failures += 1;
}

// Drive what the handler's `fetch` sees. `backend` controls the ingest call;
// `resend` controls the email fallback. Any other URL is a bug.
let calls = [];
function stubFetch({ backend = "ok", resend = "ok" } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === BACKEND_URL) {
      if (backend === "ok") return { ok: true, status: 200, text: async () => '{"success":true}' };
      if (backend === "down") throw new Error("ECONNREFUSED");
      return { ok: false, status: 500, text: async () => '{"error":"boom"}' };
    }
    if (url === "https://api.resend.com/emails") {
      if (resend === "ok") return { ok: true, status: 200, text: async () => "" };
      return { ok: false, status: 422, text: async () => '{"message":"domain not verified"}' };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

// Clean any provider config left over from the shell, so the default paths are
// deterministic (backend-first, no email).
for (const k of ["RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_PORT", "SMTP_SECURE", "CONTACT_INGEST_TOKEN"]) {
  delete process.env[k];
}

// 1. GET is rejected
let r = await call(null, { method: "GET" });
check("GET -> 405", r.statusCode === 405, { code: r.statusCode });

// 2. Missing fields are rejected with per-field errors
stubFetch();
r = await call({ name: "", email: "nope", topic: "Not a topic", message: "hi" });
check("invalid payload -> 400 validation_failed",
  r.statusCode === 400 && r.body.error === "validation_failed", { code: r.statusCode, body: r.body });
check("reports name, email, topic and message errors",
  ["name", "email", "topic", "message"].every((k) => r.body.errors && r.body.errors[k]), r.body.errors);
check("a rejected payload never reaches the backend", calls.length === 0, calls.length);

// 3. The backend is the preferred path: the enquiry is recorded there so the
//    dashboard can answer it.
stubFetch({ backend: "ok" });
r = await call(valid, { ip: "9.9.9.1" });
check("backend ingest ok -> 200", r.statusCode === 200 && r.body.ok === true, r.body);
check("posts the enquiry to the backend ingest URL",
  calls.length === 1 && calls[0].url === BACKEND_URL, calls.map((c) => c.url));
check("backend payload carries the enquiry",
  calls[0] && JSON.parse(calls[0].init.body).email === "ada@example.com"
    && JSON.parse(calls[0].init.body).topic === valid.topic, calls[0] && calls[0].init.body);
check("backend is tried before any email provider", calls.length === 1, calls.length);

// 4. Backend unreachable and no mail provider -> fail loudly, not a false success
stubFetch({ backend: "down" });
r = await call(valid, { ip: "9.9.9.2" });
check("backend down + no provider -> 502 delivery_failed",
  r.statusCode === 502 && r.body.error === "delivery_failed", { code: r.statusCode, body: r.body });

// 5. Honeypot reports success without contacting anything
stubFetch();
r = await call({ ...valid, website: "http://spam.example" }, { ip: "9.9.9.3" });
check("honeypot -> 200 ok", r.statusCode === 200 && r.body.ok === true, r.body);
check("honeypot triggers no delivery", calls.length === 0, calls.length);

// 6. Disallowed origin is refused
stubFetch();
r = await call(valid, { origin: "https://evil.example", ip: "9.9.9.4" });
check("foreign origin -> 403", r.statusCode === 403 && r.body.error === "origin_not_allowed", r.body);
check("foreign origin triggers no delivery", calls.length === 0, calls.length);

// 7. Same-origin is allowed (then reaches the backend stub, proving the origin check passed)
stubFetch({ backend: "ok" });
r = await call(valid, { origin: "https://coopvest-website.vercel.app", ip: "9.9.9.5" });
check("same origin passes origin check", r.statusCode === 200, r.body);

// 8. Rate limiting kicks in after the per-window allowance
stubFetch({ backend: "ok" });
let last;
for (let i = 0; i < 8; i += 1) {
  last = await call(valid, { ip: "7.7.7.7" });
}
check("rate limit -> 429", last.statusCode === 429, { code: last.statusCode, body: last.body });

// 9. Control characters are stripped before they can reach the backend or mail
stubFetch({ backend: "ok" });
r = await call({ ...valid, name: "Ada\r\nBcc: victim@example.com" }, { ip: "9.9.9.6" });
check("header injection is neutralised", r.statusCode === 200
  && !JSON.parse(calls[0].init.body).name.includes("\n"), r.body);

// 10. A configured shared secret is forwarded to the backend
process.env.CONTACT_INGEST_TOKEN = "s3cret";
stubFetch({ backend: "ok" });
r = await call(valid, { ip: "9.9.9.7" });
check("X-Contact-Token is sent when configured",
  calls[0] && calls[0].init.headers["X-Contact-Token"] === "s3cret", calls[0] && calls[0].init.headers);
delete process.env.CONTACT_INGEST_TOKEN;

// 11. Backend ingest failure falls back to Resend when it is configured
process.env.RESEND_API_KEY = "test_key";
stubFetch({ backend: "error", resend: "ok" });
r = await call(valid, { ip: "9.9.9.8" });
check("backend error + Resend ok -> 200", r.statusCode === 200 && r.body.ok === true, r.body);
const resendCall = calls.find((c) => c.url === "https://api.resend.com/emails");
check("falls back to Resend after the backend fails", Boolean(resendCall), calls.map((c) => c.url));
check("Resend carries the enquiry with Reply-To the sender",
  resendCall && JSON.parse(resendCall.init.body).reply_to === "ada@example.com"
    && JSON.parse(resendCall.init.body).subject.includes("Ada Okonkwo"), resendCall && resendCall.init.body);
check("HTML body escapes the message",
  resendCall && JSON.parse(resendCall.init.body).html.includes("enrol my staff"), null);

// 12. Resend failure is reported without leaking provider detail
stubFetch({ backend: "down", resend: "fail" });
r = await call(valid, { ip: "9.9.9.9" });
check("backend down + Resend failure -> 502 delivery_failed",
  r.statusCode === 502 && r.body.error === "delivery_failed", r.body);
check("provider detail is not leaked to the visitor",
  !JSON.stringify(r.body).includes("domain not verified"), r.body);

// 13. SMTP fallback. nodemailer is installed, so stub its transport to confirm
//     the envelope we build is correct without opening a socket.
delete process.env.RESEND_API_KEY;
process.env.SMTP_HOST = "smtp.gmail.com";
process.env.SMTP_USER = "sender@example.com";
process.env.SMTP_PASS = "app-password";

const nodemailer = await import("nodemailer");
let smtpCall = null;
let smtpOptions = null;
nodemailer.default.createTransport = (options) => {
  smtpOptions = options;
  return {
    sendMail: async (message) => {
      smtpCall = message;
      return { messageId: "stub" };
    },
  };
};

stubFetch({ backend: "down" });
r = await call(valid, { ip: "9.9.9.10" });
check("backend down + SMTP fallback -> 200", r.statusCode === 200 && r.body.ok === true, r.body);
check("SMTP transport uses the configured host and TLS on 465",
  smtpOptions && smtpOptions.host === "smtp.gmail.com" && smtpOptions.port === 465
    && smtpOptions.secure === true, smtpOptions);
check("SMTP message carries the enquiry and returns to the sender",
  smtpCall && smtpCall.to === "coopvestafrica@gmail.com"
    && smtpCall.replyTo === "ada@example.com"
    && smtpCall.subject.includes("Ada Okonkwo")
    && smtpCall.text.includes("enrol my staff"), smtpCall && smtpCall.subject);

// 14. Port 587 switches to STARTTLS rather than implicit TLS
process.env.SMTP_PORT = "587";
stubFetch({ backend: "down" });
r = await call(valid, { ip: "9.9.9.11" });
check("SMTP port 587 uses STARTTLS", smtpOptions && smtpOptions.port === 587
  && smtpOptions.secure === false, smtpOptions);

// 15. An SMTP failure is reported without leaking credentials
nodemailer.default.createTransport = () => ({
  sendMail: async () => { throw new Error("535-5.7.8 Username and Password not accepted"); },
});
stubFetch({ backend: "down" });
r = await call(valid, { ip: "9.9.9.12" });
check("SMTP failure -> 502 without leaking the password or host",
  r.statusCode === 502 && !JSON.stringify(r.body).includes("app-password")
    && !JSON.stringify(r.body).includes("smtp.gmail.com")
    && !JSON.stringify(r.body).includes("Username and Password not accepted"), r.body);

// 16. Incomplete SMTP config is ignored, so we still refuse cleanly
delete process.env.SMTP_PASS;
delete process.env.SMTP_PORT;
stubFetch({ backend: "down" });
r = await call(valid, { ip: "9.9.9.13" });
check("incomplete SMTP config -> 502 delivery_failed",
  r.statusCode === 502 && r.body.error === "delivery_failed", { code: r.statusCode, body: r.body });

rmSync(TMP, { force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
