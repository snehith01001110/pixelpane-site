/* Pixel Pane — minimal interaction layer.
   Reveals each SVG line drawing when it scrolls into view by adding
   `.is-visible`, which the stylesheet turns into a stroke-draw transition.
   Nothing else runs on this page. */

(function () {
  "use strict";

  // Signal to CSS that JS is on, so it can hide the strokes and draw them in.
  // Without this class the art renders fully (no-JS fallback).
  document.documentElement.classList.add("js");

  var arts = document.querySelectorAll(".line-art");
  if (!arts.length) return;

  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // No IntersectionObserver (or reduced motion): just show everything.
  if (reduce || !("IntersectionObserver" in window)) {
    arts.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });

  arts.forEach(function (el) { io.observe(el); });
})();

/* Notch demo: auto-expand/collapse on a gentle loop while in view, so the
   Alcove-style interaction is visible without requiring a hover. Hovering or
   focusing the notch takes over via CSS; the loop pauses while that happens. */
(function () {
  "use strict";

  var notch = document.getElementById("ppNotch");
  if (!notch) return;

  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) { notch.classList.add("is-open"); return; }

  var hovering = false;
  var inView = false;
  var timer;

  notch.addEventListener("mouseenter", function () { hovering = true; });
  notch.addEventListener("mouseleave", function () { hovering = false; });
  notch.addEventListener("focus", function () { hovering = true; });
  notch.addEventListener("blur", function () { hovering = false; });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { inView = e.isIntersecting; });
    }, { threshold: 0.4 }).observe(notch);
  } else {
    inView = true;
  }

  function tick() {
    if (!inView) {
      notch.classList.remove("is-open");
    } else if (!hovering) {
      notch.classList.toggle("is-open");
    }
    var open = notch.classList.contains("is-open");
    timer = setTimeout(tick, open ? 3200 : 1900);
  }
  timer = setTimeout(tick, 1400);
})();

/* Copy the contact email to the clipboard instead of opening a mail client. */
(function () {
  "use strict";

  var btn = document.getElementById("copy-email");
  if (!btn) return;

  var email = btn.getAttribute("data-email");
  var resetLabel = btn.getAttribute("data-label") || btn.textContent.trim();
  var revertTimer;

  function flash(text) {
    btn.textContent = text;
    btn.classList.add("is-copied");
    clearTimeout(revertTimer);
    revertTimer = setTimeout(function () {
      btn.textContent = resetLabel;
      btn.classList.remove("is-copied");
    }, 2200);
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  btn.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(
        function () { flash("Copied — " + email); },
        function () { flash(legacyCopy(email) ? "Copied — " + email : email); }
      );
    } else {
      flash(legacyCopy(email) ? "Copied — " + email : email);
    }
  });
})();
