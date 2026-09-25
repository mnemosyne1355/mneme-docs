/* MNEME studio site — trade interface.
   Read-only market readouts: token header + pool stats (via Dexscreener's
   public API) + embedded chart + deep links. The on-page swap widget lives
   in swap.js (UniversalRouter v2.1.1 -> the MNEME/musebook Uniswap v4 pool). */
(function () {
  "use strict";

  var cfg = window.MNEME_CONFIG;
  if (!cfg) return;

  function $(id) { return document.getElementById(id); }

  var tokenLive = cfg.isLive(cfg.MNEME_TOKEN_ADDRESS);

  // --- token header ---
  var addrEl = $("token-addr");
  var copyBtn = $("addr-copy");
  var statusEl = $("token-status");
  if (tokenLive) {
    if (addrEl) addrEl.textContent = cfg.MNEME_TOKEN_ADDRESS;
    if (copyBtn) {
      copyBtn.hidden = false;
      copyBtn.addEventListener("click", function () {
        var done = function () {
          copyBtn.textContent = "copied!";
          setTimeout(function () { copyBtn.textContent = "copy"; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cfg.MNEME_TOKEN_ADDRESS).then(done, done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = cfg.MNEME_TOKEN_ADDRESS;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch (e) { /* noop */ }
          document.body.removeChild(ta);
          done();
        }
      });
    }
    if (statusEl) statusEl.textContent = "live on Robinhood Chain — quote asset: musebook.";
  } else {
    if (statusEl) statusEl.textContent = "the token contract isn't public yet — the address lands here at launch.";
  }

  // --- pool stats (Dexscreener public API, graceful when unconfigured) ---
  var noteEl = $("stat-note");
  if (!tokenLive) {
    if (noteEl) noteEl.textContent = "price, liquidity and volume appear here once the pool is live — data via dexscreener.";
    return;
  }

  fetch("https://api.dexscreener.com/token-pairs/v1/robinhood/" + cfg.MNEME_TOKEN_ADDRESS)
    .then(function (r) {
      if (!r.ok) throw new Error("dexscreener " + r.status);
      return r.json();
    })
    .then(function (pairs) {
      if (!Array.isArray(pairs) || pairs.length === 0) throw new Error("no pairs indexed yet");
      // prefer the musebook-quoted pair if there are several
      var pair = pairs[0];
      for (var i = 0; i < pairs.length; i++) {
        var q = pairs[i].quoteToken || {};
        if (q.address && q.address.toLowerCase() === cfg.MUSEBOOK_ADDRESS.toLowerCase()) { pair = pairs[i]; break; }
      }
      setStat("stat-price", pair.priceUsd ? "$" + Number(pair.priceUsd).toPrecision(4) : "–");
      setStat("stat-liq", pair.liquidity && pair.liquidity.usd ? fmtUsd(pair.liquidity.usd) : "–");
      setStat("stat-vol", pair.volume && pair.volume.h24 ? fmtUsd(pair.volume.h24) : "–");
      if (noteEl) noteEl.textContent = "live data via dexscreener — refreshes on page load.";
    })
    .catch(function (err) {
      console.warn("[trade] stats not available yet:", err && err.message);
      if (noteEl) noteEl.textContent = "stats aren't indexed yet — check back shortly after launch.";
    });

  function setStat(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }
  function fmtUsd(n) {
    n = Number(n);
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "m";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
    return "$" + n.toFixed(2);
  }

  // --- chart + deep links ---
  if (cfg.DEXSCREENER_PAIR_URL) {
    var wrap = $("chart-wrap");
    var frame = $("dex-chart");
    var ph = $("chart-placeholder");
    var open = $("dex-open");
    if (frame) frame.src = cfg.DEXSCREENER_PAIR_URL + "?embed=1&theme=dark";
    if (wrap) wrap.hidden = false;
    if (ph) ph.hidden = true;
    if (open) {
      open.hidden = false;
      open.href = cfg.DEXSCREENER_PAIR_URL;
    }
  }
})();
