/* MNEME studio site — hash-routed tabs + countdown to the next Sunday 20:00 UTC draw.
   Routes: #/ (Home), #/mint (Mint), #/play (Play), #/trade (Trade), #/docs (Docs).
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

  /* ---------- mint countdown (front-page news) ---------- */
  var MINT_OPEN_MS = Date.UTC(2026, 9, 3, 0, 0, 0); // Oct 3, 2026 00:00 UTC

  function tickMintCountdown() {
    var now = Date.now();
    var diff = MINT_OPEN_MS - now;
    var label = document.getElementById("mint-cd-label");
    if (diff <= 0) {
      if (label) label.textContent = "Mint is live";
      diff = 0;
    }
    var totalSec = Math.floor(diff / 1000);
    var vals = {
      d: pad(Math.floor(totalSec / 86400)),
      h: pad(Math.floor((totalSec % 86400) / 3600)),
      m: pad(Math.floor((totalSec % 3600) / 60)),
      s: pad(totalSec % 60)
    };
    var els = document.querySelectorAll("[data-mint-cd]");
    for (var i = 0; i < els.length; i++) {
      var k = els[i].getAttribute("data-mint-cd");
      if (vals[k] !== undefined) els[i].textContent = vals[k];
    }
  }

  tickMintCountdown();
  setInterval(tickMintCountdown, 1000);

  /* ---------- token section: copy button + live dexscreener stats ---------- */
  (function tokenSection() {
    var cfg = window.MNEME_CONFIG || {};
    var copyBtn = document.getElementById("addr-copy");
    var addrEl = document.getElementById("token-addr");
    if (copyBtn && addrEl) {
      copyBtn.addEventListener("click", function () {
        var addr = addrEl.textContent.trim();
        function done() {
          copyBtn.textContent = "copied";
          setTimeout(function () { copyBtn.textContent = "copy"; }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(addr).then(done, done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = addr;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch (e) {}
          document.body.removeChild(ta);
          done();
        }
      });
    }

    var token = cfg.MNEME_TOKEN_ADDRESS;
    if (!token || !cfg.isLive || !cfg.isLive(token)) return;
    var elPrice = document.getElementById("stat-price");
    var elLiq = document.getElementById("stat-liq");
    var elVol = document.getElementById("stat-vol");
    if (!elPrice || !elLiq || !elVol) return;

    function fmtUsd(v) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
      if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
      return "$" + Number(v).toFixed(2);
    }
    function fmtPrice(v) {
      if (v === null || v === undefined || isNaN(v)) return "–";
      v = Number(v);
      if (v === 0) return "$0";
      if (v >= 0.01) return "$" + v.toFixed(4);
      // small prices: show first 3 significant digits
      var s = v.toPrecision(3);
      return "$" + s;
    }

    function refresh() {
      fetch("https://api.dexscreener.com/token-pairs/v1/robinhood/" + token)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (pairs) {
          if (!pairs || !pairs.length) return;
          var p = pairs[0];
          elPrice.textContent = fmtPrice(p.priceUsd);
          elLiq.textContent = fmtUsd(p.liquidity && p.liquidity.usd);
          elVol.textContent = fmtUsd(p.volume && p.volume.h24);
        })
        .catch(function () { /* leave placeholders on failure */ });
    }
    refresh();
    setInterval(refresh, 60000);
  })();

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

  /* ---------- wallet (nav connect button) ---------- */
  window.MnemeWallet = (function () {
    var cfg = window.MNEME_CONFIG || {};
    var CHAIN_HEX = "0x" + (cfg.CHAIN_ID || 4663).toString(16);
    var account = null;
    var btn = document.getElementById("nav-connect");

    function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }

    function renderBtn() {
      if (!btn) return;
      if (account) {
        btn.textContent = shortAddr(account);
        btn.classList.add("connected");
        btn.title = "Connected: " + account + " — click to disconnect";
      } else {
        btn.textContent = "Connect Wallet";
        btn.classList.remove("connected");
        btn.title = "";
      }
    }

    function notify() {
      renderBtn();
      window.dispatchEvent(new CustomEvent("mneme:account", { detail: { account: account } }));
    }

    function ensureChain() {
      return window.ethereum.request({ method: "eth_chainId" }).then(function (id) {
        if (id && id.toLowerCase() === CHAIN_HEX.toLowerCase()) return;
        return window.ethereum.request({
          method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }]
        }).catch(function (err) {
          if (err && err.code === 4902) {
            return window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: CHAIN_HEX,
                chainName: cfg.CHAIN_NAME || "Robinhood Chain",
                nativeCurrency: { name: "Ether", symbol: cfg.NATIVE_SYMBOL || "ETH", decimals: 18 },
                rpcUrls: [cfg.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"]
              }]
            });
          }
          throw err;
        });
      });
    }

    function connect() {
      if (!window.ethereum) {
        if (btn) {
          btn.textContent = "No wallet found";
          setTimeout(renderBtn, 2200);
        }
        return Promise.reject(new Error("no ethereum provider"));
      }
      if (btn) btn.textContent = "Connecting…";
      return window.ethereum.request({ method: "eth_requestAccounts" }).then(function (accounts) {
        account = (accounts && accounts[0]) || null;
        if (!account) throw new Error("no accounts returned");
        return ensureChain().then(function () { notify(); return account; });
      }).catch(function (err) {
        console.warn("[wallet] connect failed", err);
        renderBtn();
        throw err;
      });
    }

    function disconnect() {
      account = null;
      notify();
    }

    if (btn) {
      btn.addEventListener("click", function () {
        if (account) disconnect();
        else connect().catch(function () {});
      });
      if (window.ethereum && window.ethereum.on) {
        window.ethereum.on("accountsChanged", function (accounts) {
          account = (accounts && accounts[0]) || null;
          notify();
        });
        window.ethereum.on("chainChanged", function () { window.location.reload(); });
      }
    }

    renderBtn();

    return {
      get account() { return account; },
      connect: connect,
      disconnect: disconnect
    };
  })();
})();
