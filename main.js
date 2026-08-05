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

/* Notch demo — a working miniature of Pixel Pane's v1.1 notch assistant.
   The panel opens on hover (and on an idle loop for discovery), you can type
   and "send", switch mode/model, grant file sources, copy the chat, and start
   over. Replies are scripted locally — there's no network — but every control
   is live. */
(function () {
  "use strict";

  var notch = document.getElementById("ppNotch");
  var panel = document.getElementById("ppPanel");
  if (!notch || !panel) return;

  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (sel, root) { return (root || panel).querySelector(sel); };
  var input       = $("#ppInput");
  var sendBtn     = $("#ppSend");
  var newBtn      = $("#ppNew");
  var chatSurfaceBtn = $("#ppChatSurface");
  var terminalSurfaceBtn = $("#ppTerminalSurface");
  var chatPane    = $("#ppChatPane");
  var terminalPane= $("#ppTerminalPane");
  var terminalLines = $("#ppTerminalLines");
  var terminalInput = $("#ppTerminalInput");
  var musicWindow = document.querySelector(".music-window");
  var musicPlay = document.getElementById("ppMusicPlay");
  var railPreview = document.getElementById("ppRailPreview");
  var transcript  = $("#ppTranscript");
  var fileInput   = $("#ppFileInput");
  var folderInput = $("#ppFolderInput");
  var modeIcoEl   = $('[data-role="mode-ico"]');
  var modeLabelEl = $('[data-role="mode-label"]');
  var modelChip   = $("#ppModelChip");
  var modelLabelEl= $('[data-role="model-label"]');
  var srcIcoEl    = $('[data-role="sources-ico"]');
  var srcLabelEl  = $('[data-role="sources-label"]');
  var srcListEl   = $('[data-role="sources-list"]');
  var srcClearBtn = $('[data-action="clear"]');
  var srcSep      = $(".np-menu-sep--sources");

  // ── state ────────────────────────────────────────────────────────────────
  var mode = "Local";            // Local | Cloud | Custom
  var model = "Qwen3.6-35B-A3B";
  var surface = "chat";          // chat | terminal
  var sources = [
    { name: "pixel-pane-site", dir: true },
    { name: "pixel-pane", dir: true },
    { name: "Desktop", dir: true },
    { name: "Downloads", dir: true }
  ];
  var msgCount = 0;
  var running = false;
  var streamTimer = null;
  var hovering = false;
  var isFocused = false;
  var inView = true;
  var loopEnabled = !reduce;
  var loopTimer = null;
  var collapseTimer = null;
  var previewHideTimer = null;
  var activeRailIndex = 0;
  var mediaPlaying = false;

  var chatPreviews = [
    { title: "Update the landing demo", subtitle: "On screen", lines: [["You", "make the notch demo match the new app"], ["Pixel Pane", "I found the panel changes and mapped them into the site demo."]] },
    { title: "Review local changes", subtitle: "12 min. ago", lines: [["You", "what changed in this branch?"], ["Pixel Pane", "Three demo files changed: markup, panel styling, and local interaction state."]] },
    { title: "Explain captured error", subtitle: "Yesterday", lines: [["You", "what is this terminal error saying?"], ["Pixel Pane", "The local server is running, but the browser permission bridge is blocked."]] },
    { title: "Tighten homepage copy", subtitle: "Tue", lines: [["You", "make this sound less like marketing"], ["Pixel Pane", "I kept the privacy promise and cut the softer filler around it."]] }
  ];
  var terminalPreviews = [
    { title: "~/pixel-pane-site", subtitle: "Terminal · on screen", lines: [["", "nayak@Snehiths-MacBook-Pro ~/pixel-pane-site › npm run build"], ["", "✓ built static assets in 312ms"]] },
    { title: "~", subtitle: "Terminal · idle", lines: [["", "nayak@Snehiths-MacBook-Pro ~ › ls"], ["", "Applications  Documents  Library  Pictures"]] },
    { title: "~/Documents/pixel-pane", subtitle: "Terminal · running", lines: [["", "swift test --filter AgentModelGateway"], ["", "Testing started…"]] }
  ];

  // ── inline SVGs used when swapping chip icons ──────────────────────────────
  var ICON = {
    modeLocal:  '<svg viewBox="0 0 18 16" width="12" height="11" fill="none" stroke="currentColor"><rect x="4" y="2.6" width="10" height="7.2" rx="1.3" stroke-width="1.2"/><path d="M2.4 12.4h13.2" stroke-width="1.2" stroke-linecap="round"/><path d="M7.5 6.1v-.8a1.5 1.5 0 0 1 3 0v.8" stroke-width="1"/><rect x="7.1" y="6" width="3.8" height="3" rx="0.7" fill="currentColor" stroke="none"/></svg>',
    modeCloud:  '<svg viewBox="0 0 18 14" width="12" height="10" fill="none" stroke="currentColor"><path d="M5 11.3h7.4a3 3 0 0 0 .3-5.96A4 4 0 0 0 5 5.9 2.7 2.7 0 0 0 5 11.3z" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    modeCustom: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor"><circle cx="5.6" cy="6.4" r="2.7" stroke-width="1.2"/><path d="M7.6 8.4 13.2 14M11 12.2l1.3-1.3M12.4 13.4l1.2-1.2" stroke-width="1.2" stroke-linecap="round"/></svg>',
    srcEmpty:   '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor"><path d="M2 5.4h4l1.3 1.6H14v6.2H2z" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    srcFilled:  '<svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2 5.2h4.2l1.3 1.6H14a.6.6 0 0 1 .6.6v5.2a.6.6 0 0 1-.6.6H2a.6.6 0 0 1-.6-.6V5.8A.6.6 0 0 1 2 5.2z"/></svg>',
    docSmall:   '<svg class="np-src-ico" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"><path d="M4 2.6h5l3 3v7.8H4z" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    folderSmall:'<svg class="np-src-ico" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"><path d="M2 5.4h4l1.3 1.6H14v6.2H2z" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    remove:     '<svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor"><path d="M4 4l6 6M10 4l-6 6" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  // ── panel open / collapse with content-driven height ───────────────────────
  function stageMax() {
    var stage = notch.parentElement;
    var h = (stage ? stage.clientHeight : 400) - 20;
    return Math.max(150, Math.min(h, 384));
  }
  function layout() {
    if (!notch.classList.contains("is-open")) return;
    notch.classList.toggle("is-terminal", surface === "terminal");
    notch.classList.toggle("has-messages", surface === "chat" && msgCount > 0);
    var max = stageMax();
    var preferred = surface === "terminal" ? 160 : (msgCount > 0 ? 270 : 100);
    transcript.style.maxHeight = Math.max(80, Math.min(150, max - 120)) + "px";
    var target = Math.min(max, preferred);
    notch.style.height = target + "px";
  }
  function openPanel(focusInput) {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    notch.classList.add("is-open");
    layout();
    if (focusInput && !isTouch()) {
      requestAnimationFrame(function () { try { input.focus(); } catch (e) {} });
    }
  }
  function pinned() { return running || hovering || menuOpenName() != null; }
  function collapse() {
    if (running) return;
    hideRailPreviewSoon();
    closeAllMenus();
    if (notch.contains(document.activeElement)) {
      try { document.activeElement.blur(); } catch (e) {}
    }
    if (isFocused) { input.blur(); isFocused = false; }
    notch.classList.remove("is-open");
    notch.classList.remove("is-terminal");
    notch.classList.remove("has-messages");
    notch.style.height = "";
  }
  function scheduleCollapse() {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = setTimeout(function () {
      if (!pinned()) collapse();
    }, 240);
  }
  function isTouch() {
    return window.matchMedia && window.matchMedia("(hover: none)").matches;
  }
  function stopLoop() {
    loopEnabled = false;
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  }
  function scrollTranscript() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function previewData(index) {
    var list = surface === "terminal" ? terminalPreviews : chatPreviews;
    return list[index % list.length];
  }

  function showRailPreview(dot, index) {
    if (!railPreview) return;
    if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
    var data = previewData(index);
    railPreview.querySelector('[data-role="preview-title"]').textContent = data.title;
    railPreview.querySelector('[data-role="preview-subtitle"]').textContent = data.subtitle;
    var body = railPreview.querySelector('[data-role="preview-body"]');
    body.classList.toggle("is-terminal", surface === "terminal");
    body.innerHTML = data.lines.map(function (line) {
      return '<div class="np-preview-line">' +
        '<span class="np-preview-speaker">' + escapeHtml(line[0]) + '</span>' +
        '<span class="np-preview-text">' + escapeHtml(line[1]) + '</span>' +
        '</div>';
    }).join("");

    railPreview.hidden = false;
    var stage = notch.parentElement;
    var dotRect = dot.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();
    var panelRect = notch.getBoundingClientRect();
    var width = railPreview.offsetWidth || 280;
    var left = panelRect.left - stageRect.left - width - 12;
    left = Math.min(left, stageRect.width - width - 12);
    left = Math.max(24, left);
    var top = dotRect.top - stageRect.top - 22;
    top = Math.max(12, Math.min(top, stageRect.height - railPreview.offsetHeight - 12));
    railPreview.style.left = left + "px";
    railPreview.style.top = top + "px";
    void railPreview.offsetWidth;
    railPreview.classList.add("is-visible");
  }

  function hideRailPreviewSoon() {
    if (!railPreview) return;
    if (previewHideTimer) clearTimeout(previewHideTimer);
    previewHideTimer = setTimeout(function () {
      railPreview.classList.remove("is-visible");
      setTimeout(function () {
        if (!railPreview.classList.contains("is-visible")) railPreview.hidden = true;
      }, 150);
    }, 140);
  }

  function setActiveRailDot(index) {
    activeRailIndex = index;
    panel.querySelectorAll(".np-rail-dot").forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === index);
    });
  }

  function loadRailEntry(index) {
    setActiveRailDot(index);
    if (surface === "terminal") {
      var data = previewData(index);
      var command = (data.lines[0] && data.lines[0][1]) || "ls";
      var output = (data.lines[1] && data.lines[1][1]) || "";
      terminalLines.innerHTML =
        '<div>' + escapeHtml(command) + '</div>' +
        '<div>' + escapeHtml(output) + '</div>' +
        terminalPromptHTML();
      terminalInput = $("#ppTerminalInput");
      bindTerminalInput();
      focusTerminalSoon();
    } else {
      var chat = previewData(index);
      transcript.innerHTML =
        '<div class="np-turn">' +
          '<div class="np-q">' + escapeHtml(chat.lines[0][1]) + '</div>' +
          '<div class="np-a">' +
            '<div class="np-a-meta">Pixel Pane</div>' +
            '<div class="np-a-text">' + escapeHtml(chat.lines[1][1]) + '</div>' +
          '</div>' +
        '</div>';
      transcript.hidden = false;
      msgCount = 1;
      updateChat();
      openPanel(false);
    }
  }

  function terminalPromptHTML() {
    return '<div class="term-input-row"><span class="term-user">nayak@Snehiths-MacBook-Pro</span> <span class="term-path">~</span> <span class="term-prompt">›</span> <span class="term-input" id="ppTerminalInput" role="textbox" aria-label="Terminal command" contenteditable="plaintext-only" spellcheck="false"></span><span class="term-caret"></span></div>';
  }

  function focusTerminalSoon() {
    if (!terminalInput || isTouch()) return;
    requestAnimationFrame(function () {
      try { terminalInput.focus(); } catch (e) {}
    });
  }

  function runTerminalCommand() {
    if (!terminalInput) return;
    var command = terminalInput.textContent.trim();
    if (!command) return;
    var output = command === "clear" ? "" :
      command === "pwd" ? "/Users/nayak" :
      command === "ls" ? "Applications  Documents  Library  output.txt" :
      "you have to download the app for that";
    var next = terminalLines.innerHTML.replace(/<div class="term-input-row">[\s\S]*$/, "");
    if (command === "clear") {
      terminalLines.innerHTML = terminalPromptHTML();
    } else {
      terminalLines.innerHTML = next +
        '<div><span class="term-user">nayak@Snehiths-MacBook-Pro</span> <span class="term-path">~</span> <span class="term-prompt">›</span> ' + escapeHtml(command) + '</div>' +
        '<div>' + escapeHtml(output) + '</div>' +
        terminalPromptHTML();
    }
    terminalInput = $("#ppTerminalInput");
    bindTerminalInput();
    focusTerminalSoon();
  }

  function bindTerminalInput() {
    if (!terminalInput || terminalInput.dataset.bound === "true") return;
    terminalInput.dataset.bound = "true";
    terminalInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        runTerminalCommand();
      } else if (e.key === "Escape") {
        terminalInput.blur();
      }
    });
  }

  function setMediaPlaying(on) {
    mediaPlaying = on;
    notch.classList.toggle("is-media-playing", on);
    if (musicWindow) musicWindow.classList.toggle("is-playing", on);
    if (musicPlay) {
      musicPlay.setAttribute("aria-pressed", on ? "true" : "false");
      musicPlay.setAttribute("aria-label", on ? "Pause music" : "Play music");
    }
  }

  // ── the chat ───────────────────────────────────────────────────────────────
  function metaLabel() {
    if (mode === "Cloud") return "Cloud";
    if (mode === "Custom") return "Custom";
    return model === "Auto" ? "Local" : model;
  }
  function reply(text) {
    var t = text.toLowerCase();
    var body;
    if (/(^|\b)(hi|hey|hello|yo|sup)(\b|$)/.test(t)) {
      body = "Hey — I live in your notch. Point me at something on screen, or just ask.";
    } else if (t.indexOf("what") > -1 && (t.indexOf("do") > -1 || t.indexOf("can") > -1)) {
      body = "I read whatever you point me at, then extract text, translate, explain code, or run a quick task — and I only touch a file or run a command after you confirm.";
    } else if (t.indexOf("privacy") > -1 || t.indexOf("local") > -1 || t.indexOf("data") > -1 || t.indexOf("track") > -1) {
      body = "By default everything runs on-device: no continuous recording, no silent file access, no memory carried between chats. Cloud is opt-in, one request at a time.";
    } else if (t.indexOf("price") > -1 || t.indexOf("cost") > -1 || t.indexOf("free") > -1 || t.indexOf("download") > -1) {
      body = "Pixel Pane is a free download for macOS, with free updates.";
    } else if (t.indexOf("who") > -1 || t.indexOf("your name") > -1) {
      body = "I'm Pixel Pane — a local-first assistant that lives in the Mac notch.";
    } else {
      var where = mode === "Cloud"
        ? "through the opt-in cloud route"
        : "on a " + metaLabel() + " model, right on your Mac";
      var withSrc = sources.length
        ? " using your " + sources.length + " granted source" + (sources.length > 1 ? "s" : "")
        : "";
      body = "Good question. In the app I'd work that out " + where + withSrc +
             ", then surface any file writes or commands for you to confirm first.";
    }
    return body;
  }
  function addTurn(question) {
    var turn = document.createElement("div");
    turn.className = "np-turn";
    var q = document.createElement("div");
    q.className = "np-q";
    q.textContent = question;
    var a = document.createElement("div");
    a.className = "np-a";
    a.innerHTML = '<div class="np-thinking"><span class="np-burst"></span>Thinking</div>';
    turn.appendChild(q);
    turn.appendChild(a);
    transcript.appendChild(turn);
    transcript.hidden = false;
    msgCount++;
    return a;
  }
  function send() {
    var text = input.value.trim();
    if (!text || running) return;
    stopLoop();
    var answerEl = addTurn(text);
    input.value = "";
    autoGrow();
    setRunning(true);
    updateChat();
    openPanel(false);
    scrollTranscript();

    var full = reply(text);
    var think = reduce ? 120 : 620;
    streamTimer = setTimeout(function () {
      answerEl.innerHTML =
        '<div class="np-a-meta">' + escapeHtml(metaLabel()) + '</div>' +
        '<div class="np-a-text"></div>';
      var textEl = answerEl.querySelector(".np-a-text");
      if (reduce) { textEl.textContent = full; finishStream(); return; }
      var words = full.split(" ");
      var i = 0;
      textEl.innerHTML = '<span class="np-cursor"></span>';
      (function tickWord() {
        i++;
        textEl.innerHTML = escapeHtml(words.slice(0, i).join(" ")) +
          (i < words.length ? '<span class="np-cursor"></span>' : "");
        layout(); scrollTranscript();
        if (i < words.length) {
          streamTimer = setTimeout(tickWord, 34 + Math.min(46, words[i - 1].length * 7));
        } else {
          finishStream();
        }
      })();
    }, think);
  }
  function finishStream() {
    running = false;
    streamTimer = null;
    setRunning(false);
    updateChat();
    layout(); scrollTranscript();
    if (isFocused || (!isTouch() && notch.classList.contains("is-open"))) {
      try { input.focus(); } catch (e) {}
    }
  }
  function cancelStream() {
    if (!running) return;
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    var last = transcript.querySelector(".np-turn:last-child .np-a");
    if (last) {
      var textEl = last.querySelector(".np-a-text");
      if (!textEl) {
        last.innerHTML = '<div class="np-a-meta">' + escapeHtml(metaLabel()) +
          '</div><div class="np-a-text">Stopped.</div>';
      } else {
        var cur = textEl.querySelector(".np-cursor");
        if (cur) cur.remove();
        if (!textEl.textContent.trim()) textEl.textContent = "Stopped.";
      }
    }
    finishStream();
  }
  function newChat() {
    if (running) cancelStream();
    transcript.innerHTML = "";
    transcript.hidden = true;
    msgCount = 0;
    updateChat();
    openPanel(true);
  }
  function setRunning(on) {
    running = on;
    sendBtn.classList.toggle("is-running", on);
    sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
    sendBtn.title = on ? "Stop" : "Send";
    updateSendState();
  }
  function updateSendState() {
    sendBtn.disabled = running ? false : input.value.trim() === "";
  }
  function updateChat() {
    updateSendState();
    var has = msgCount > 0;
    newBtn.disabled = !has || running;
    notch.classList.toggle("has-messages", surface === "chat" && has);
  }

  function setSurface(next, shouldOpen) {
    surface = next;
    var terminal = surface === "terminal";
    chatPane.hidden = terminal;
    terminalPane.hidden = !terminal;
    chatSurfaceBtn.classList.toggle("is-active", !terminal);
    terminalSurfaceBtn.classList.toggle("is-active", terminal);
    notch.classList.toggle("is-terminal", terminal);
    notch.classList.toggle("has-messages", !terminal && msgCount > 0);
    closeAllMenus();
    stopLoop();
    if (shouldOpen) openPanel(!terminal);
    else layout();
    if (terminal && shouldOpen) focusTerminalSoon();
  }

  // ── composer ────────────────────────────────────────────────────────────────
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(92, input.scrollHeight) + "px";
    layout();
  }
  input.addEventListener("input", function () { autoGrow(); updateSendState(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    else if (e.key === "Escape") { input.blur(); }
  });
  input.addEventListener("focus", function () { isFocused = true; stopLoop(); openPanel(false); });
  input.addEventListener("blur", function () { isFocused = false; });
  sendBtn.addEventListener("click", function () { running ? cancelStream() : send(); });
  newBtn.addEventListener("click", newChat);
  chatSurfaceBtn.addEventListener("click", function (e) { e.stopPropagation(); setSurface("chat", true); });
  terminalSurfaceBtn.addEventListener("click", function (e) { e.stopPropagation(); setSurface("terminal", true); });
  terminalPane.addEventListener("click", function (e) {
    e.stopPropagation();
    openPanel(false);
    focusTerminalSoon();
  });
  if (musicPlay) {
    musicPlay.addEventListener("click", function (e) {
      e.stopPropagation();
      stopLoop();
      setMediaPlaying(!mediaPlaying);
    });
  }
  panel.querySelectorAll(".np-rail-dot").forEach(function (dot, index) {
    dot.addEventListener("mouseenter", function () {
      stopLoop();
      openPanel(false);
      showRailPreview(dot, index);
    });
    dot.addEventListener("mouseleave", hideRailPreviewSoon);
    dot.addEventListener("click", function (e) {
      e.stopPropagation();
      stopLoop();
      openPanel(false);
      loadRailEntry(index);
      showRailPreview(dot, index);
    });
    dot.addEventListener("focus", function () { showRailPreview(dot, index); });
    dot.addEventListener("blur", hideRailPreviewSoon);
  });

  // ── dropdown menus (moved to <body> so the notch clip can't cut them) ────────
  var menus = {};   // name -> { wrap, chip, menu }
  panel.querySelectorAll(".np-menu-wrap").forEach(function (wrap) {
    var name = wrap.getAttribute("data-menu");
    var chip = wrap.querySelector(".np-chip");
    var menu = wrap.querySelector(".np-menu");
    document.body.appendChild(menu);          // escape the clipping ancestor
    menus[name] = { wrap: wrap, chip: chip, menu: menu };
    chip.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu(name);
    });
    menu.addEventListener("click", function (e) { e.stopPropagation(); });
  });
  function menuOpenName() {
    for (var n in menus) if (menus[n].menu.classList.contains("is-open")) return n;
    return null;
  }
  function positionMenu(entry) {
    var m = entry.menu;
    m.hidden = false;
    var r = entry.chip.getBoundingClientRect();
    var mw = m.offsetWidth, mh = m.offsetHeight;
    var left = r.left;
    if (left + mw > window.innerWidth - 8) left = r.right - mw;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + "px";
    m.style.top = top + "px";
  }
  function openMenu(name) {
    closeAllMenus(name);
    var entry = menus[name];
    stopLoop();
    positionMenu(entry);
    // reflow so the transition runs from the hidden state
    void entry.menu.offsetWidth;
    entry.menu.classList.add("is-open");
    entry.chip.setAttribute("aria-expanded", "true");
  }
  function closeMenu(name) {
    var entry = menus[name];
    if (!entry || entry.menu.hidden) return;
    entry.menu.classList.remove("is-open");
    entry.chip.setAttribute("aria-expanded", "false");
    var m = entry.menu;
    setTimeout(function () { if (!m.classList.contains("is-open")) m.hidden = true; }, 150);
  }
  function closeAllMenus(except) {
    for (var n in menus) if (n !== except) closeMenu(n);
  }
  function toggleMenu(name) {
    if (menus[name].menu.classList.contains("is-open")) closeMenu(name);
    else openMenu(name);
  }

  // menu item handling
  Object.keys(menus).forEach(function (name) {
    menus[name].menu.addEventListener("click", function (e) {
      var item = e.target.closest(".np-menuitem");
      if (!item) return;
      var value = item.getAttribute("data-value");
      var action = item.getAttribute("data-action");
      if (name === "model" && value) {
        setChecked(menus.model.menu, item);
        model = value;
        modelLabelEl.textContent = value;
      } else if (name === "mode" && value) {
        setChecked(menus.mode.menu, item);
        setMode(value);
      } else if (name === "sources" && action === "folder") {
        folderInput.click();
      } else if (name === "sources" && action === "file") {
        fileInput.click();
      } else if (name === "sources" && action === "clear") {
        sources = []; renderSources();
      }
      // "Manage Models…" opens Settings in the real app — a no-op here.
      closeMenu(name);
      if (!isTouch() && action !== "folder" && action !== "file") {
        try { input.focus(); } catch (err) {}
      }
    });
  });
  function setChecked(menu, item) {
    menu.querySelectorAll('[role="menuitemradio"]').forEach(function (el) {
      el.setAttribute("aria-checked", el === item ? "true" : "false");
    });
  }
  function setMode(value) {
    mode = value;
    modeLabelEl.textContent = value;
    modeIcoEl.innerHTML =
      value === "Cloud" ? ICON.modeCloud :
      value === "Custom" ? ICON.modeCustom : ICON.modeLocal;
    // The model chip is a local-route control — the app hides it off-Local.
    modelChip.parentElement.style.display = value === "Local" ? "" : "none";
    layout();
  }

  // ── file sources ─────────────────────────────────────────────────────────────
  fileInput.addEventListener("change", function () {
    Array.prototype.forEach.call(fileInput.files, function (f) {
      sources.push({ name: f.name, dir: false });
    });
    fileInput.value = "";
    renderSources();
  });
  folderInput.addEventListener("change", function () {
    var names = {};
    Array.prototype.forEach.call(folderInput.files, function (f) {
      var top = (f.webkitRelativePath || f.name).split("/")[0];
      names[top] = true;
    });
    Object.keys(names).forEach(function (n) { sources.push({ name: n, dir: true }); });
    folderInput.value = "";
    renderSources();
  });
  function renderSources() {
    var n = sources.length;
    srcLabelEl.innerHTML = n === 0 ? "No&nbsp;Sources" : (n === 1 ? "1&nbsp;Source" : n + "&nbsp;Sources");
    srcIcoEl.innerHTML = n === 0 ? ICON.srcEmpty : ICON.srcFilled;
    srcListEl.innerHTML = "";
    sources.forEach(function (s, idx) {
      var row = document.createElement("div");
      row.className = "np-menu-source";
      row.innerHTML = (s.dir ? ICON.folderSmall : ICON.docSmall) +
        '<span class="np-src-name"></span>' +
        '<button class="np-src-remove" type="button" aria-label="Remove">' + ICON.remove + "</button>";
      row.querySelector(".np-src-name").textContent = s.name;
      row.querySelector(".np-src-remove").addEventListener("click", function (e) {
        e.stopPropagation();
        sources.splice(idx, 1);
        renderSources();
        positionMenu(menus.sources); // height changed
      });
      srcListEl.appendChild(row);
    });
    var hasAny = n > 0;
    srcClearBtn.hidden = !hasAny;
    srcSep.hidden = !hasAny;
    if (menus.sources.menu.classList.contains("is-open")) positionMenu(menus.sources);
  }

  // ── open / collapse triggers ─────────────────────────────────────────────────
  notch.addEventListener("mouseenter", function () { hovering = true; openPanel(false); });
  notch.addEventListener("mouseleave", function () { hovering = false; scheduleCollapse(); });
  // Menus live at body level; hovering them must keep the panel alive.
  Object.keys(menus).forEach(function (name) {
    menus[name].menu.addEventListener("mouseenter", function () { hovering = true; });
    menus[name].menu.addEventListener("mouseleave", function () { hovering = false; scheduleCollapse(); });
  });

  notch.addEventListener("click", function (e) {
    if (e.target.closest(".np-chip, .np-menu, .np-iconbtn, .np-src-remove, .np-surface-toggle, .np-terminal-folder, .np-terminal-surface, .np-rail-dot")) return;
    openPanel(true);
  });
  notch.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target === notch) {
      e.preventDefault(); openPanel(true);
    } else if (e.key === "Escape") {
      if (menuOpenName()) closeAllMenus();
      else collapse();
    }
  });

  document.addEventListener("click", function (e) {
    if (!panel.contains(e.target) && !e.target.closest(".np-menu")) {
      closeAllMenus();
      if (!running) { hovering = false; collapse(); }
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menuOpenName()) closeAllMenus();
  });
  window.addEventListener("resize", function () { closeAllMenus(); layout(); });
  window.addEventListener("scroll", function () { closeAllMenus(); }, { passive: true });

  // initial paint
  updateChat();
  setMode("Local");
  renderSources();
  setSurface("chat", false);
  bindTerminalInput();
  setActiveRailDot(0);
  setMediaPlaying(false);
})();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* Version badge — pulls the latest tag from the releases repo so the
   footer doesn't go stale after a release. Leaves the baked-in text alone
   on any failure (offline, rate-limited, etc). */
(function () {
  "use strict";

  var el = document.getElementById("ppVersion");
  if (!el || !window.fetch) return;

  fetch("https://api.github.com/repos/snehith01001110/pixelpane-releases/releases/latest")
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      if (!data || !data.tag_name) return;
      el.textContent = "v" + data.tag_name.replace(/^v/i, "");
    })
    .catch(function () {});
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
