(function () {
  "use strict";

  var core = window.PixelPaneSupportCore;
  var form = document.getElementById("supportForm");
  if (!core || !form) return;

  var startedAt = performance.now();
  var bootstrap = window.PixelPaneSupportBootstrap || { context: null };
  var diagnostics = core.createDiagnosticsState(bootstrap.context);
  var submission = core.createSubmissionLock();
  var diagnosticsSection = document.getElementById("supportDiagnostics");
  var diagnosticsList = document.getElementById("supportDiagnosticsList");
  var removeDiagnostics = document.getElementById("removeDiagnostics");
  var sendButton = document.getElementById("supportSend");
  var status = document.getElementById("supportStatus");
  var configuration = window.PixelPaneSupportConfiguration || {};
  var hasValidConfiguration = core.validSentryDSN(configuration.sentryDSN);
  var sentryInitialized = false;
  var sentryLoadPromise = null;

  function setStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind || "neutral";
  }

  function renderDiagnostics() {
    var rows = core.diagnosticsRows(diagnostics.get());
    diagnosticsSection.hidden = rows.length === 0;
    diagnosticsList.replaceChildren();
    rows.forEach(function (row) {
      var key = row[2];
      var label = document.createElement("label");
      var title = document.createElement("span");
      var input;
      title.textContent = row[0];
      if (key === "route" || key === "architecture") {
        input = document.createElement("select");
        var values = key === "route"
          ? ["local", "openrouter", "custom"]
          : ["arm64", "x86_64", "unknown"];
        values.forEach(function (value) {
          var option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          input.append(option);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.maxLength = key === "macOSVersion" || key === "source" ? 32 : 64;
      }
      input.name = "diagnostic-" + key;
      input.dataset.diagnosticKey = key;
      input.value = row[1];
      if (key === "source") input.readOnly = true;
      label.append(title, input);
      diagnosticsList.append(label);
    });
  }

  function readEditedDiagnostics() {
    if (!diagnostics.get()) return null;
    var candidate = {};
    diagnosticsList.querySelectorAll("[data-diagnostic-key]").forEach(function (input) {
      candidate[input.dataset.diagnosticKey] = input.value.trim();
    });
    return core.validateSupportContext(candidate);
  }

  function loadSentryBundle() {
    if (window.Sentry) return Promise.resolve(window.Sentry);
    if (sentryLoadPromise) return sentryLoadPromise;
    sentryLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = core.SENTRY_BUNDLE_URL;
      script.integrity = core.SENTRY_BUNDLE_INTEGRITY;
      script.crossOrigin = "anonymous";
      script.onload = function () {
        if (window.Sentry) resolve(window.Sentry);
        else {
          sentryLoadPromise = null;
          reject(new Error("Sentry feedback bundle did not initialize"));
        }
      };
      script.onerror = function () {
        sentryLoadPromise = null;
        reject(new Error("Sentry feedback bundle failed to load"));
      };
      document.head.append(script);
    });
    return sentryLoadPromise;
  }

  async function ensureSentry() {
    if (sentryInitialized) return true;
    if (!hasValidConfiguration) return false;
    try {
      await loadSentryBundle();
    } catch (_error) {
      return false;
    }
    try {
      window.Sentry.init({
        dsn: configuration.sentryDSN,
        defaultIntegrations: false,
        integrations: [],
        sendDefaultPii: false,
        autoSessionTracking: false,
        maxBreadcrumbs: 0,
        attachStacktrace: false,
        sendClientReports: false,
        enableLogs: false,
        tracesSampleRate: 0,
        profilesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        beforeBreadcrumb: function () { return null; },
        beforeSendTransaction: function () { return null; },
        beforeSend: core.sanitizeFeedbackEvent
      });
    } catch (_error) {
      return false;
    }
    sentryInitialized = true;
    return true;
  }

  removeDiagnostics.addEventListener("click", function () {
    diagnostics.remove();
    renderDiagnostics();
    setStatus("Diagnostics removed. Only the fields you write will be sent.", "neutral");
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (submission.isLocked()) return;

    var result = core.validateForm({
      category: form.elements.category.value,
      happened: form.elements.happened.value,
      reproduction: form.elements.reproduction.value,
      expected: form.elements.expected.value,
      email: form.elements.email.value,
      website: form.elements.website.value
    }, performance.now() - startedAt);

    if (result.errors.website) {
      submission.begin();
      sendButton.disabled = true;
      setStatus("Thanks. Your report was received.", "success");
      return;
    }
    if (!result.valid) {
      var firstError = Object.keys(result.errors)[0];
      setStatus(result.errors[firstError], "error");
      var field = firstError && form.elements[firstError];
      if (field && typeof field.focus === "function") field.focus();
      return;
    }

    var editedDiagnostics = readEditedDiagnostics();
    if (diagnostics.get() && !editedDiagnostics) {
      setStatus("Review the diagnostics values or remove them before sending.", "error");
      return;
    }
    if (editedDiagnostics) diagnostics.replace(editedDiagnostics);

    if (!await ensureSentry()) {
      setStatus("Private reports are temporarily unavailable. Please try again later.", "error");
      return;
    }
    if (!submission.begin()) return;
    sendButton.disabled = true;
    sendButton.textContent = "Sending…";
    setStatus("Sending your private report…", "neutral");

    try {
      var payload = core.buildFeedbackPayload(result.values, diagnostics.get());
      await window.Sentry.sendFeedback(payload, {
        includeReplay: false,
        errorMessages: {
          ERROR_TIMEOUT: "The report timed out.",
          ERROR_FORBIDDEN: "The report service rejected this submission.",
          ERROR_GENERIC: "The report could not be sent."
        }
      });
      submission.succeed();
      sendButton.textContent = "Sent";
      setStatus("Report sent. Thank you — it is private to the Pixel Pane team.", "success");
    } catch (_error) {
      submission.fail();
      sendButton.disabled = false;
      sendButton.textContent = "Send private report";
      setStatus("The report could not be sent. Check your connection and try again.", "error");
      sendButton.focus();
    }
  });

  renderDiagnostics();
  if (!hasValidConfiguration) {
    setStatus("Private reports are temporarily unavailable while setup is completed.", "error");
  }
})();
