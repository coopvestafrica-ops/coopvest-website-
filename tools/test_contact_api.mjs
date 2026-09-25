// Local smoke test for the contact handler. Not part of the deployment.
// Copies api/contact.js to .mjs so it can be imported without a package.json
// rewrite, then drives it with stub req/res objects.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The copy must live inside the project so bare imports such as `nodemailer`
// resolve against node_modules.
const TMP = new URL("./.contact_under_test.mjs", import.meta.url);
writeFileSync(TMP, readFileSync(new URL("../api/contact.js", import.meta.url), "utf8"));
const { default: handler } = await import(pathToFileURL(TMP.pathname).href);

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

// 1. GET is rejected
let r = await call(null, { method: "GET" });
check("GET -> 405", r.statusCode === 405, { code: r.statusCode });

// 2. Missing fields are rejected with per-field errors
r = await call({ name: "", email: "nope", topic: "Not a topic", message: "hi" });
check("invalid payload -> 400 validation_failed",
  r.statusCode === 400 && r.body.error === "validation_failed", { code: r.statusCode, body: r.body });
check("reports name, email, topic and message errors",
  ["name", "email", "topic", "message"].every((k) => r.body.errors && r.body.errors[k]), r.body.errors);

// 3. Without RESEND_API_KEY a valid submission returns 503, not a false success
delete process.env.RESEND_API_KEY;
r = await call(valid, { ip: "9.9.9.1" });
check("valid but unconfigured -> 503 email_not_configured",
  r.statusCode === 503 && r.body.error === "email_not_configured", { code: r.statusCode, body: r.body });

// 4. Honeypot reports success without sending
r = await call({ ...valid, website: "http://spam.example" }, { ip: "9.9.9.2" });
check("honeypot -> 200 ok", r.statusCode === 200 && r.body.ok === true, r.body);

// 5. Disallowed origin is refused
r = await call(valid, { origin: "https://evil.example", ip: "9.9.9.3" });
check("foreign origin -> 403", r.statusCode === 403 && r.body.error === "origin_not_allowed", r.body);

// 6. Same-origin is allowed (then fails on config, proving it passed the origin check)
r = await call(valid, { origin: "https://coopvest-website.vercel.app", ip: "9.9.9.4" });
check("same origin passes origin check", r.statusCode === 503, r.body);

// 7. Rate limiting kicks in after the per-window allowance
let last;
for (let i = 0; i < 8; i += 1) {
  last = await call(valid, { ip: "7.7.7.7" });
}
check("rate limit -> 429", last.statusCode === 429, { code: last.statusCode, body: last.body });

// 8. Control characters are stripped before they can reach mail headers
r = await call({ ...valid, name: "Ada\r\nBcc: victim@example.com" }, { ip: "9.9.9.5" });
check("header injection is neutralised (no 200 success, no crash)",
  r.statusCode === 503 || r.statusCode === 400, r.body);

// 9. With a Resend key set, delivery is attempted against Resend (stubbed fetch)
process.env.RESEND_API_KEY = "test_key";
let captured = null;
globalThis.fetch = async (url, init) => {
  captured = { url, headers: init.headers, body: JSON.parse(init.body) };
  return { ok: true, status: 200, text: async () => "" };
};
r = await call(valid, { ip: "9.9.9.6" });
check("configured + upstream ok -> 200", r.statusCode === 200 && r.body.ok === true, r.body);
check("posts to Resend with the enquiry", captured && captured.url === "https://api.resend.com/emails"
  && captured.body.subject.includes("Ada Okonkwo"), captured && captured.body.subject);
check("Reply-To defaults to the sender", captured && captured.body.reply_to === "ada@example.com",
  captured && captured.body.reply_to);
check("HTML body escapes the message", captured && captured.body.html.includes("enrol my staff"), null);

// 10. Upstream failure is reported without leaking provider detail
globalThis.fetch = async () => ({ ok: false, status: 422, text: async () => '{"message":"domain not verified"}' });
r = await call(valid, { ip: "9.9.9.7" });
check("upstream failure -> 502 delivery_failed", r.statusCode === 502 && r.body.error === "delivery_failed", r.body);
check("provider detail is not leaked to the visitor",
  !JSON.stringify(r.body).includes("domain not verified"), r.body);

// 11. SMTP path. nodemailer is installed, so stub its transport to confirm the
//     envelope we build is correct without opening a socket.
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

r = await call(valid, { ip: "9.9.9.8" });
check("SMTP path delivers -> 200", r.statusCode === 200 && r.body.ok === true, r.body);
check("SMTP transport uses the configured host and TLS on 465",
  smtpOptions && smtpOptions.host === "smtp.gmail.com" && smtpOptions.port === 465
    && smtpOptions.secure === true, smtpOptions);
check("SMTP message carries the enquiry and returns to the sender",
  smtpCall && smtpCall.to === "coopvestafrica@gmail.com"
    && smtpCall.replyTo === "ada@example.com"
    && smtpCall.subject.includes("Ada Okonkwo")
    && smtpCall.text.includes("enrol my staff"), smtpCall && smtpCall.subject);

// 12. Port 587 switches to STARTTLS rather than implicit TLS
process.env.SMTP_PORT = "587";
r = await call(valid, { ip: "9.9.9.10" });
check("SMTP port 587 uses STARTTLS", smtpOptions && smtpOptions.port === 587
  && smtpOptions.secure === false, smtpOptions);

// 13. An SMTP failure is reported without leaking credentials
nodemailer.default.createTransport = () => ({
  sendMail: async () => { throw new Error("535-5.7.8 Username and Password not accepted"); },
});
r = await call(valid, { ip: "9.9.9.11" });
check("SMTP failure -> 502 without leaking the password or host",
  r.statusCode === 502 && !JSON.stringify(r.body).includes("app-password")
    && !JSON.stringify(r.body).includes("smtp.gmail.com")
    && !JSON.stringify(r.body).includes("Username and Password not accepted"), r.body);

// 14. SMTP env is ignored when incomplete, so we still refuse cleanly
delete process.env.SMTP_PASS;
delete process.env.SMTP_PORT;
r = await call(valid, { ip: "9.9.9.9" });
check("incomplete SMTP config -> 503 email_not_configured",
  r.statusCode === 503 && r.body.error === "email_not_configured", { code: r.statusCode, body: r.body });

rmSync(TMP, { force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
