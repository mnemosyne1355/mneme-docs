/* MNEME studio site — hash-routed tabs + countdown to the next Sunday 20:00 UTC draw.
   Routes: #/ (Home), #/mint (Mint), #/play (Play), #/docs (Docs), #/trade (Trade).
   First draw target: 2026-10-11T20:00:00Z; afterwards rolls weekly. */
(function () {
  "use strict";

  /* ---------- countdown ---------- */
  var FIRST_DRAW_MS = Date.UTC(2026, 9, 11, 20, 0, 0);
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function nextDrawMs(nowMs) {
    if (nowMs < FIRST_DRAW_MS) return FIRST_DRAW_MS;
    var d = new Date(nowMs);
    var addDays = (7 - d.getUTCDay()) % 7; // days until Sunday
    var t = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + addDays,
      20, 0, 0
    );
    if (t <= nowMs) t += WEEK_MS;
    return t;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function tickCountdown() {
    var now = Date.now();
    var diff = nextDrawMs(now) - now;
    if (diff < 0) diff = 0;
    var totalSec = Math.floor(diff / 1000);
    var vals = {
      d: pad(Math.floor(totalSec / 86400)),
      h: pad(Math.floor((totalSec % 86400) / 3600)),
      m: pad(Math.floor((totalSec % 3600) / 60)),
      s: pad(totalSec % 60)
    };
    // drive every countdown chip group on the page (home hero + play tab)
    var els = document.querySelectorAll("[data-cd]");
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute("data-cd");
      if (vals[k] !== undefined) els[i].textContent = vals[k];
    }
  }

  tickCountdown();
  setInterval(tickCountdown, 1000);

  /* ---------- hash router ---------- */
  var ROUTES = {
    home:  { tab: "home",  title: "MNEME — gaming & entertainment studio" },
    mint:  { tab: "mint",  title: "Mint — MNEME" },
    play:  { tab: "play",  title: "Play — MNEME" },
    docs:  { tab: "docs",  title: "Docs — MNEME" },
    trade: { tab: "trade", title: "Trade — MNEME" }
  };

  // legacy anchors from the old single-scroll layout
  var LEGACY = {
    "#draw": "play",
    "#relics": "mint",
    "#token": "trade",
    "#proof": "home",
    "#faq": "docs",
    "#top": "home",
    "#fine-print": "docs"
  };

  function routeFromHash() {
    var h = window.location.hash || "#/";
    if (LEGACY[h]) return LEGACY[h];
    var m = h.match(/^#\/([a-z]*)\/?$/);
    if (m) {
      var key = m[1] === "" ? "home" : m[1];
      if (ROUTES[key]) return key;
    }
    return "home";
  }

  var tabs = document.querySelectorAll(".tab");
  var links = document.querySelectorAll(".tab-link");

  function render() {
    var route = routeFromHash();
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === route);
    }
    for (var j = 0; j < links.length; j++) {
      var on = links[j].getAttribute("data-route") === route;
      links[j].classList.toggle("active", on);
      if (on) links[j].setAttribute("aria-selected", "true");
      else links[j].removeAttribute("aria-selected");
    }
    document.title = ROUTES[route].title;
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);
  render();
})();
