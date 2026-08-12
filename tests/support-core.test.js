"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const support = require("../support-core.js");

const siteRoot = path.resolve(__dirname, "..");

function fragmentFor(value) {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function validContext(overrides = {}) {
  return {
    appVersion: "1.6.0",
    build: "8",
    macOSVersion: "15.5.0",
    architecture: "arm64",
    route: "openrouter",
    source: "app",
    ...overrides
  };
}

function validForm(overrides = {}) {
  return {
    category: "Unexpected behavior",
    happened: "The panel closed while I was reviewing the answer.",
    reproduction: "Open the panel, ask a question, then move the pointer.",
    expected: "The panel should stay open.",
    email: "person@example.com",
    website: "",
    ...overrides
  };
}

test("support context parses a closed schema and clears URL state immediately", () => {
  const fragment = fragmentFor(validContext());
  const calls = [];
  const consumed = support.consumeSupportContext(
    { hash: `#${fragment}`, pathname: "/support.html", search: "?not=context" },
    { replaceState: (...args) => calls.push(args) }
  );

  assert.deepEqual(consumed.context, validContext());
  assert.equal(consumed.hadFragment, true);
  assert.deepEqual(calls, [[null, "", "/support.html"]]);
  assert.deepEqual(Object.keys(consumed.context).sort(), support.CONTEXT_KEYS.slice().sort());
});

test("invalid, unknown, and oversized support contexts fail closed", () => {
  assert.equal(support.parseSupportContext(fragmentFor(validContext({ path: "/Users/alice" }))), null);
  assert.equal(support.parseSupportContext(fragmentFor(validContext({ route: "provider-name" }))), null);
  assert.equal(support.parseSupportContext("not*base64url"), null);
  assert.equal(support.parseSupportContext("a".repeat(support.MAX_FRAGMENT_LENGTH + 1)), null);
  assert.equal(support.validateSupportContext(validContext({ source: "web" })), null);
});

test("form validation enforces required fields, limits, timing, email, and honeypot", () => {
  const valid = support.validateForm(validForm(), support.MIN_COMPLETION_MS);
  assert.equal(valid.valid, true);

  assert.equal(support.validateForm(validForm({ happened: "" }), 4000).errors.happened.length > 0, true);
  assert.equal(support.validateForm(validForm({ happened: "x".repeat(4001) }), 4000).valid, false);
  assert.equal(support.validateForm(validForm({ email: "not-an-email" }), 4000).valid, false);
  assert.equal(support.validateForm(validForm({ website: "bot.example" }), 4000).valid, false);
  assert.equal(support.validateForm(validForm(), 2999).errors.timing.length > 0, true);
});

test("payload construction includes only written fields and reviewed diagnostics", () => {
  const values = support.validateForm(validForm(), 4000).values;
  const payload = support.buildFeedbackPayload(values, validContext());
  const serialized = JSON.stringify(payload);

  assert.match(payload.message, /Category: Unexpected behavior/);
  assert.match(payload.message, /App version: 1\.6\.0/);
  assert.match(payload.message, /Route: openrouter/);
  assert.equal(payload.email, "person@example.com");
  assert.equal(serialized.includes('"url"'), false);
  assert.equal(serialized.includes("/Users/"), false);
  assert.deepEqual(Object.keys(payload).sort(), ["email", "message", "source", "url"]);

  const withoutEmail = support.buildFeedbackPayload(
    support.validateForm(validForm({ email: "" }), 4000).values,
    null
  );
  assert.equal("email" in withoutEmail, false);
  assert.equal(withoutEmail.message.includes("Diagnostics"), false);
});

test("diagnostics can be edited within the schema or removed completely", () => {
  const state = support.createDiagnosticsState(validContext());
  assert.equal(state.replace(validContext({ appVersion: "1.6.1", route: "custom" })), true);
  assert.equal(state.get().appVersion, "1.6.1");
  assert.equal(state.get().route, "custom");
  assert.equal(state.replace(validContext({ architecture: "MacBookPro18,3" })), false);
  assert.equal(state.get().architecture, "arm64");
  assert.equal(state.remove(), null);
  assert.deepEqual(support.diagnosticsRows(state.get()), []);
});

test("feedback sanitizer drops errors and strips URL, request, user, and arbitrary data", () => {
  assert.equal(support.sanitizeFeedbackEvent({ type: "error" }), null);
  const sanitized = support.sanitizeFeedbackEvent({
    event_id: "a".repeat(32),
    timestamp: 1234,
    type: "feedback",
    contexts: {
      feedback: {
        message: "Reviewed report",
        contact_email: "person@example.com",
        url: "https://pixelpane.app/support.html#secret",
        name: "Arbitrary Name"
      },
      trace: { trace_id: "secret" }
    },
    request: { headers: { cookie: "secret" } },
    user: { id: "secret" },
    tags: { arbitrary: "secret" },
    breadcrumbs: [{ message: "secret" }]
  });

  assert.deepEqual(sanitized, {
    event_id: "a".repeat(32),
    timestamp: 1234,
    type: "feedback",
    level: "info",
    platform: "javascript",
    contexts: {
      feedback: {
        message: "Reviewed report",
        source: "pixelpane-support",
        contact_email: "person@example.com"
      }
    }
  });
});

test("submission locking blocks duplicates, stays locked on success, and unlocks for retry", () => {
  const lock = support.createSubmissionLock();
  assert.equal(lock.begin(), true);
  assert.equal(lock.begin(), false);
  lock.fail();
  assert.equal(lock.isLocked(), false);
  assert.equal(lock.begin(), true);
  lock.succeed();
  assert.equal(lock.isLocked(), true);
  assert.equal(lock.begin(), false);
});

test("feedback DSN validation rejects missing or placeholder configuration", () => {
  assert.equal(support.validSentryDSN("__PIXELPANE_SENTRY_FEEDBACK_DSN__"), false);
  assert.equal(support.validSentryDSN("http://public@example.com/1"), false);
  assert.equal(support.validSentryDSN("https://public@example.ingest.sentry.io/1234"), true);
});

test("feedback browser bundle is exactly pinned with Subresource Integrity", () => {
  assert.equal(
    support.SENTRY_BUNDLE_URL,
    "https://browser.sentry-cdn.com/10.70.0/bundle.feedback.min.js"
  );
  assert.equal(
    support.SENTRY_BUNDLE_INTEGRITY,
    "sha384-i/V864vT/71bOcxAzIf1EaSRevgRoWWXdzivP15Zp9bX+vsH0kbQ6NwUXcu3qleZ"
  );
});

test("support page is explicit-submit, CSP restricted, and linked throughout the site", () => {
  const page = fs.readFileSync(path.join(siteRoot, "support.html"), "utf8");
  const controller = fs.readFileSync(path.join(siteRoot, "support.js"), "utf8");

  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /default-src 'none'/);
  assert.match(page, /connect-src https:\/\/\*\.ingest\.sentry\.io/);
  assert.doesNotMatch(page, /<script[^>]+src=["'][^"']*sentry/i);
  assert.ok(page.indexOf("support-core.js") < page.indexOf("support-config.js"));
  assert.ok(page.indexOf("support-config.js") < page.indexOf("support.js"));
  assert.match(page, /name="happened"[^>]+maxlength="4000"[^>]+required/);
  assert.match(page, /name="email"[^>]+maxlength="254"/);
  assert.match(page, /name="website"[^>]+tabindex="-1"/);

  const submitHandler = controller.indexOf('form.addEventListener("submit"');
  const loadFromSubmit = controller.indexOf("if (!await ensureSentry())", submitHandler);
  assert.ok(submitHandler >= 0 && loadFromSubmit > submitHandler);
  assert.match(controller, /script\.integrity = core\.SENTRY_BUNDLE_INTEGRITY/);
  assert.match(controller, /defaultIntegrations: false/);
  assert.match(controller, /replaysSessionSampleRate: 0/);

  for (const file of ["index.html", "privacy.html", "terms.html", "refunds.html"]) {
    const contents = fs.readFileSync(path.join(siteRoot, file), "utf8");
    assert.match(contents, /href="support\.html"/, `${file} should link to private support`);
  }
});
