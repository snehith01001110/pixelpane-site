(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PixelPaneSupportCore = api;
    // This script executes before the pinned Sentry bundle. Consume and clear
    // app diagnostics immediately so the fragment never reaches the SDK.
    if (root.location && root.history) {
      root.PixelPaneSupportBootstrap = api.consumeSupportContext(
        root.location,
        root.history
      );
    }
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var MAX_FRAGMENT_LENGTH = 2048;
  var MIN_COMPLETION_MS = 3000;
  var SENTRY_BUNDLE_URL = "https://browser.sentry-cdn.com/10.70.0/bundle.feedback.min.js";
  var SENTRY_BUNDLE_INTEGRITY = "sha384-i/V864vT/71bOcxAzIf1EaSRevgRoWWXdzivP15Zp9bX+vsH0kbQ6NwUXcu3qleZ";
  var CATEGORIES = ["Crash", "Unexpected behavior", "AI/provider issue", "Other"];
  var CONTEXT_KEYS = [
    "appVersion",
    "architecture",
    "build",
    "macOSVersion",
    "route",
    "source"
  ];
  var LIMITS = Object.freeze({
    happened: 4000,
    reproduction: 4000,
    expected: 2000,
    email: 254
  });

  function ownKeysExactly(value, expected) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var keys = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return keys.length === wanted.length && keys.every(function (key, index) {
      return key === wanted[index];
    });
  }

  function decodeBase64URL(value) {
    if (typeof value !== "string" || !value || value.length > MAX_FRAGMENT_LENGTH) {
      return null;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

    var normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    normalized += "=".repeat((4 - normalized.length % 4) % 4);
    try {
      if (typeof Buffer !== "undefined") {
        return Buffer.from(normalized, "base64").toString("utf8");
      }
      var binary = atob(normalized);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_error) {
      return null;
    }
  }

  function safeVersion(value, maxLength) {
    return typeof value === "string" &&
      value.length >= 1 && value.length <= maxLength &&
      /^[A-Za-z0-9._-]+$/.test(value);
  }

  function validateSupportContext(value) {
    if (!ownKeysExactly(value, CONTEXT_KEYS)) return null;
    if (!safeVersion(value.appVersion, 64) || !safeVersion(value.build, 64)) return null;
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value.macOSVersion)) return null;
    if (!["arm64", "x86_64", "unknown"].includes(value.architecture)) return null;
    if (!["local", "openrouter", "custom"].includes(value.route)) return null;
    if (value.source !== "app") return null;
    return Object.freeze({
      appVersion: value.appVersion,
      build: value.build,
      macOSVersion: value.macOSVersion,
      architecture: value.architecture,
      route: value.route,
      source: "app"
    });
  }

  function parseSupportContext(fragment) {
    var raw = typeof fragment === "string" ? fragment.replace(/^#/, "") : "";
    var json = decodeBase64URL(raw);
    if (!json) return null;
    try {
      return validateSupportContext(JSON.parse(json));
    } catch (_error) {
      return null;
    }
  }

  function consumeSupportContext(locationLike, historyLike) {
    var hash = locationLike && typeof locationLike.hash === "string"
      ? locationLike.hash
      : "";
    var context = parseSupportContext(hash);
    if (hash && historyLike && typeof historyLike.replaceState === "function") {
      // Clear both fragment and any unexpected query before any vendor script
      // executes. App diagnostics are valid only in the reviewed fragment.
      var cleanPath = (locationLike.pathname || "/support.html");
      historyLike.replaceState(null, "", cleanPath);
    }
    return Object.freeze({ context: context, hadFragment: Boolean(hash) });
  }

  function diagnosticsRows(context) {
    if (!context) return [];
    return [
      ["App version", context.appVersion, "appVersion"],
      ["Build", context.build, "build"],
      ["macOS", context.macOSVersion, "macOSVersion"],
      ["Architecture", context.architecture, "architecture"],
      ["Route", context.route, "route"],
      ["Source", context.source, "source"]
    ];
  }

  function createDiagnosticsState(initialContext) {
    var current = initialContext || null;
    return Object.freeze({
      get: function () { return current; },
      replace: function (candidate) {
        var validated = validateSupportContext(candidate);
        if (!validated) return false;
        current = validated;
        return true;
      },
      remove: function () { current = null; return current; }
    });
  }

  function trimmed(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function validateForm(raw, elapsedMs) {
    var values = {
      category: trimmed(raw.category),
      happened: trimmed(raw.happened),
      reproduction: trimmed(raw.reproduction),
      expected: trimmed(raw.expected),
      email: trimmed(raw.email),
      website: trimmed(raw.website)
    };
    var errors = {};
    if (!CATEGORIES.includes(values.category)) errors.category = "Choose a category.";
    if (!values.happened) errors.happened = "Tell us what happened.";
    if (values.happened.length > LIMITS.happened) errors.happened = "What happened is too long.";
    if (values.reproduction.length > LIMITS.reproduction) errors.reproduction = "Reproduction steps are too long.";
    if (values.expected.length > LIMITS.expected) errors.expected = "Expected behavior is too long.";
    if (values.email.length > LIMITS.email ||
        (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))) {
      errors.email = "Enter a valid email address or leave it blank.";
    }
    if (values.website) errors.website = "Automated submission rejected.";
    if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_COMPLETION_MS) {
      errors.timing = "Please take a moment to review the report before sending.";
    }
    return Object.freeze({
      valid: Object.keys(errors).length === 0,
      errors: Object.freeze(errors),
      values: Object.freeze(values)
    });
  }

  function buildFeedbackPayload(values, context) {
    var sections = [
      "Category: " + values.category,
      "What happened:\n" + values.happened
    ];
    if (values.reproduction) {
      sections.push("Reproduction steps:\n" + values.reproduction);
    }
    if (values.expected) {
      sections.push("Expected behavior:\n" + values.expected);
    }
    var rows = diagnosticsRows(context);
    if (rows.length) {
      sections.push("Diagnostics (reviewed by sender):\n" + rows.map(function (row) {
        return row[0] + ": " + row[1];
      }).join("\n"));
    }
    var payload = {
      message: sections.join("\n\n"),
      source: "pixelpane-support",
      // Sentry's helper otherwise inserts the current location automatically.
      // An explicit undefined value overwrites it and is omitted on the wire.
      url: undefined
    };
    if (values.email) payload.email = values.email;
    return payload;
  }

  function sanitizeFeedbackEvent(event) {
    if (!event || event.type !== "feedback") return null;
    var source = event.contexts && event.contexts.feedback;
    if (!source || typeof source.message !== "string" ||
        !source.message || source.message.length > 12000) return null;

    var feedback = {
      message: source.message,
      source: "pixelpane-support"
    };
    if (typeof source.contact_email === "string" &&
        source.contact_email.length <= LIMITS.email) {
      feedback.contact_email = source.contact_email;
    }
    var sanitized = {
      type: "feedback",
      level: "info",
      platform: "javascript",
      contexts: { feedback: feedback }
    };
    if (typeof event.event_id === "string" && /^[a-fA-F0-9]{32}$/.test(event.event_id)) {
      sanitized.event_id = event.event_id;
    }
    if (typeof event.timestamp === "number") sanitized.timestamp = event.timestamp;
    return sanitized;
  }

  function validSentryDSN(value) {
    if (typeof value !== "string" || value.includes("__") || value.includes("$(")) return false;
    return /^https:\/\/[^\s@]+@[^\s/]+\/\d+$/.test(value);
  }

  function createSubmissionLock() {
    var locked = false;
    return Object.freeze({
      begin: function () {
        if (locked) return false;
        locked = true;
        return true;
      },
      succeed: function () { locked = true; },
      fail: function () { locked = false; },
      isLocked: function () { return locked; }
    });
  }

  return Object.freeze({
    CATEGORIES: CATEGORIES.slice(),
    CONTEXT_KEYS: CONTEXT_KEYS.slice(),
    LIMITS: LIMITS,
    MAX_FRAGMENT_LENGTH: MAX_FRAGMENT_LENGTH,
    MIN_COMPLETION_MS: MIN_COMPLETION_MS,
    SENTRY_BUNDLE_URL: SENTRY_BUNDLE_URL,
    SENTRY_BUNDLE_INTEGRITY: SENTRY_BUNDLE_INTEGRITY,
    parseSupportContext: parseSupportContext,
    validateSupportContext: validateSupportContext,
    consumeSupportContext: consumeSupportContext,
    diagnosticsRows: diagnosticsRows,
    createDiagnosticsState: createDiagnosticsState,
    validateForm: validateForm,
    buildFeedbackPayload: buildFeedbackPayload,
    sanitizeFeedbackEvent: sanitizeFeedbackEvent,
    validSentryDSN: validSentryDSN,
    createSubmissionLock: createSubmissionLock
  });
});
