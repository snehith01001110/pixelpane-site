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
