/* MNEME studio site — MEGAMUSE draw dashboard.
   Zero dependencies: raw window.ethereum + JSON-RPC. No CDN, nothing to break.
   Placeholder-first: until the engine + vault addresses are configured in
   config.js, every live value shows "—" and the panels explain what's coming.
   No fake numbers, ever.

   Selectors verified with keccak256 against Megamuse.sol / MegamuseEngine.sol /
   MegamuseVault.sol (2026-09-25). Tier weights: 5 / 25 / 100 / 250 / 500. */
(function () {
  "use strict";

  var cfg = window.MNEME_CONFIG;
  if (!cfg) return;

  var dashEl = document.getElementById("dash");
  if (!dashEl) return;

  var ENGINE = cfg.MEGAMUSE_ENGINE_ADDRESS;
  var VAULT = cfg.MEGAMUSE_VAULT_ADDRESS;
  var NFT = cfg.MEGAMUSE_NFT_ADDRESS;
  var TOKEN = cfg.MNEME_TOKEN_ADDRESS;
  var MUSEBOOK = cfg.MUSEBOOK_ADDRESS;
  var gameLive = cfg.isLive(ENGINE) && cfg.isLive(VAULT);
  var nftLive = cfg.isLive(NFT);

  var TIER_NAMES = ["Rare", "Super Rare", "Ultra", "Goddess", "1 of 1"];
  var TIER_ART = ["relic-rare.webp", "relic-superrare.webp", "relic-ultra.webp",
                  "relic-goddess.webp", "relic-1of1.webp"];
  var TIER_WEIGHT = [5, 25, 100, 250, 500]; // canon; refreshed on-chain when live

  var SEL = {
    // engine
    offeringPrice:   "0xfe9f2a10", // offeringPrice()
    currentEpoch:    "0x76671808", // currentEpoch()
    epochEnd:        "0xd9be1efe", // epochEnd(uint256)
    offerings:       "0x4bd38cf4", // offerings(uint256,address)
    offeringPoints:  "0x96535a3e", // offeringPoints(uint256,address)
    streakMultBps:   "0x4de9f0d8", // streakMultBps(address)
    relicPoints:     "0x14075240", // relicPoints(uint256,address)
    totalPoints:     "0x313a249b", // totalPoints(uint256)
    relicTierWeight: "0x429a8aba", // relicTierWeight(uint8)
    buyOfferings:    "0x27d93813", // buyOfferings(uint256)
    claimFree:       "0xf366afc9", // claimFree()
    claimPrize:      "0xd7098154", // claimPrize(uint256)
    claims:          "0xa888c2cd", // claims(uint256) -> (winner,amount,drawnAt,claimed,swept)
    reservedMusebook:"0x3f34c7db", // reservedMusebook()
    // vault
    musebookBalance: "0x39df759e", // musebookBalance()
    // nft
    balanceOf:       "0x70a08231", // balanceOf(address)
    tokenOfOwnerByIndex: "0x2f745c59", // tokenOfOwnerByIndex(address,uint256)
    tierOf:          "0x53f96df2", // tierOf(uint256)
    rested:          "0xffea241f", // rested(uint256)
    redeemed:        "0x7ed0f1c1", // redeemed(uint256)
    setRested:       "0x44a8800e", // setRested(uint256,bool)
    // erc20
    decimals:        "0x313ce567", // decimals()
    allowance:       "0xdd62ed3e", // allowance(address,address)
    approve:         "0x095ea7b3"  // approve(address,uint256)
  };

  function $(id) { return document.getElementById(id); }

  function pad32(hex) {
    hex = hex.replace(/^0x/, "");
    return hex.padStart(64, "0");
  }
  function encAddr(a) { return pad32(a); }
  function encUint(n) {
    var b = BigInt(n);
    return b.toString(16).padStart(64, "0");
  }
  function toBigInt(hex) {
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
  }
  function ethCall(to, data) {
    return fetch(cfg.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: to, data: data }, "latest"] })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) throw new Error(j.error.message || "rpc error");
        return toBigInt(j.result);
      });
  }
  function fmtUnits(v, dec) {
    var s = v.toString().padStart(dec + 1, "0");
    var whole = s.slice(0, -dec).replace(/^0+(?=\d)/, "");
    var frac = s.slice(-dec).replace(/0+$/, "").slice(0, 2);
    return frac ? whole + "." + frac : whole;
  }
  function fmtInt(v) {
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }

  var state = {
    account: null,
    epoch: 0n,
    epochEndMs: 0,
    pot: 0n, reserved: 0n,
    musebookDec: 18, mnemeDec: 18,
    offeringPrice: 0n,
    entries: 0n, paidPts: 0n, relicPts: 0n, streakBps: 10000n,
    totalPts: 0n,
    relics: [],
    tierW: TIER_WEIGHT.slice()
  };

  /* ---------- badge ---------- */
  function setBadge() {
    var b = $("dash-badge");
    if (!b) return;
    if (gameLive) { b.textContent = "Live"; b.classList.add("live"); }
    else { b.textContent = "Setting up"; }
  }

  /* ---------- public state ---------- */
  function nextSundayMs() {
    var d = new Date();
    d.setUTCHours(20, 0, 0, 0);
    var add = (7 - d.getUTCDay()) % 7;
    if (add === 0 && d.getTime() <= Date.now()) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    return d.getTime();
  }

  function loadPublic() {
    if (!gameLive) {
      $("dash-countdown").textContent = "—";
      var ms = nextSundayMs();
      state.epochEndMs = ms;
      return Promise.resolve();
    }
    return Promise.all([
      ethCall(ENGINE, SEL.currentEpoch),
      ethCall(VAULT, SEL.musebookBalance),
      ethCall(ENGINE, SEL.reservedMusebook),
      ethCall(ENGINE, SEL.offeringPrice),
      ethCall(MUSEBOOK, SEL.decimals).catch(function () { return 18n; })
    ]).then(function (r) {
      state.epoch = r[0];
      var bal = r[1], reserved = r[2];
      state.pot = bal > reserved ? bal - reserved : 0n;
      state.reserved = reserved;
      state.offeringPrice = r[3];
      state.musebookDec = Number(r[4]);
      return ethCall(ENGINE, SEL.epochEnd + encUint(state.epoch)).catch(function () { return 0n; });
    }).then(function (endTs) {
      state.epochEndMs = endTs ? Number(endTs) * 1000 : nextSundayMs();
      // refresh tier weights on-chain (pure fn, cheap)
      var ps = state.tierW.map(function (_, i) {
        return ethCall(ENGINE, SEL.relicTierWeight + encUint(i)).catch(function () { return BigInt(TIER_WEIGHT[i]); });
      });
      return Promise.all(ps);
    }).then(function (ws) {
      state.tierW = ws.map(Number);
      if (cfg.isLive(TOKEN)) {
        return ethCall(TOKEN, SEL.decimals).catch(function () { return 18n; });
      }
      return 18n;
    }).then(function (d) {
      state.mnemeDec = Number(d);
      renderPublic();
    }).catch(function (err) {
      console.warn("[dash] public load failed", err);
    });
  }

  function renderPublic() {
    $("dash-epoch").textContent = gameLive ? "epoch " + state.epoch.toString() : "epoch —";
    if (gameLive) {
      $("dash-pot").textContent = fmtUnits(state.pot, state.musebookDec);
      var total = state.pot + state.reserved;
      var freePct = total > 0n ? Number(state.pot * 10000n / total) / 100 : 100;
      $("dash-potbar-free").style.width = freePct + "%";
      $("dash-potnote").innerHTML = "Winner takes it all · " +
        "<span class=\"pot-free\">" + freePct.toFixed(1) + "% free</span> · " +
        "<span class=\"pot-res\">" + (100 - freePct).toFixed(1) + "% reserved</span> for unclaimed prizes.";
      $("dash-drawnote").textContent = "Snapshot locks at the draw — entries after that count for next week.";
      var per = fmtUnits(state.offeringPrice, state.mnemeDec);
      $("dash-price").textContent = per;
    } else {
      $("dash-drawnote").textContent = "Draws go live after the mint.";
    }
  }

  /* ---------- countdown ---------- */
  function tick() {
    var el = $("dash-countdown");
    if (!el) return;
    if (!state.epochEndMs) { el.textContent = "—"; return; }
    var diff = state.epochEndMs - Date.now();
    if (diff < 0) diff = 0;
    var s = Math.floor(diff / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
        m = Math.floor(s % 3600 / 60), ss = s % 60;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    el.textContent = d > 0 ? d + "d " + p(h) + ":" + p(m) + ":" + p(ss)
                           : p(h) + ":" + p(m) + ":" + p(ss);
  }

  /* ---------- wallet state ---------- */
  function onAccount(acct) {
    state.account = acct;
    var btn = $("dash-connect");
    if (acct) {
      if (btn) btn.hidden = true;
      $("dash-user-empty").hidden = true;
      $("dash-user").hidden = false;
      loadWallet();
    } else {
      if (btn) btn.hidden = false;
      $("dash-user-empty").hidden = false;
      $("dash-user").hidden = true;
      $("dash-claim-zone").hidden = true;
      state.relics = [];
      renderRelics();
    }
  }

  function loadWallet() {
    var a = state.account;
    if (!a || !gameLive) {
      if (!gameLive) {
        $("dash-weight-note").textContent = "Positions open when the game goes live.";
        $("dash-buy").disabled = true;
        $("dash-free").disabled = true;
      }
      if (nftLive) loadRelics(); // relics exist before the engine
      return;
    }
    var ep = encUint(state.epoch);
    Promise.all([
      ethCall(ENGINE, SEL.offerings + ep + encAddr(a)).catch(function () { return 0n; }),
      ethCall(ENGINE, SEL.offeringPoints + ep + encAddr(a)).catch(function () { return 0n; }),
      ethCall(ENGINE, SEL.streakMultBps + encAddr(a)).catch(function () { return 10000n; }),
      ethCall(ENGINE, SEL.relicPoints + ep + encAddr(a)).catch(function () { return 0n; }),
      ethCall(ENGINE, SEL.totalPoints + ep).catch(function () { return 0n; })
    ]).then(function (r) {
      state.entries = r[0];
      state.paidPts = r[1];
      state.streakBps = r[2];
      state.relicPts = r[3];
      state.totalPts = r[4];
      renderUser();
      return loadRelics();
    }).then(checkPrizes)
      .catch(function (err) { console.warn("[dash] wallet load failed", err); });
  }

  function renderUser() {
    $("dash-entries").textContent = fmtInt(state.entries);
    var w = state.paidPts + state.relicPts;
    $("dash-weight").textContent = fmtInt(w);
    var mult = Number(state.streakBps) / 10000;
    $("dash-streak").textContent = mult.toFixed(1) + "×";
    if (state.totalPts > 0n && w > 0n) {
      var pct = Number(w * 1000000n / state.totalPts) / 10000;
      var oneIn = Math.round(Number(state.totalPts) / Number(w));
      $("dash-odds").textContent = pct >= 0.01 ? pct.toFixed(2) + "%" : "<0.01%";
      $("dash-odds-sub").textContent = "about 1 in " + fmtInt(BigInt(oneIn));
    } else {
      $("dash-odds").textContent = "—";
      $("dash-odds-sub").textContent = w > 0n ? "no competition yet" : "buy an offering to enter";
    }
    var bits = [];
    bits.push(fmtInt(state.entries) + " " + (state.entries === 1n ? "entry" : "entries"));
    if (state.relicPts > 0n) bits.push("+" + fmtInt(state.relicPts) + " relic bonus");
    bits.push("×" + mult.toFixed(1) + " streak");
    $("dash-weight-note").textContent = "Weight = " + bits.join(" · ") +
      " · total week weight " + fmtInt(state.totalPts) + ".";
  }

  /* ---------- relics ---------- */
  function loadRelics() {
    var a = state.account;
    if (!a || !nftLive) { renderRelics(); return Promise.resolve(); }
    return ethCall(NFT, SEL.balanceOf + encAddr(a)).catch(function () { return 0n; })
      .then(function (bal) {
        var n = Number(bal);
        if (n === 0 || n > 50) { state.relics = []; renderRelics(); return; }
        var ps = [];
        for (var i = 0; i < n; i++) ps.push(i);
        return Promise.all(ps.map(function (i) {
          return ethCall(NFT, SEL.tokenOfOwnerByIndex + encAddr(a) + encUint(i))
            .then(function (id) {
              return Promise.all([
                ethCall(NFT, SEL.tierOf + encUint(id)).catch(function () { return 0n; }),
                ethCall(NFT, SEL.rested + encUint(id)).catch(function () { return 0n; }),
                ethCall(NFT, SEL.redeemed + encUint(id)).catch(function () { return 0n; })
              ]).then(function (r) {
                return { id: id, tier: Number(r[0]), rested: r[1] === 1n, redeemed: r[2] === 1n };
              });
            }).catch(function () { return null; });
        })).then(function (list) {
          state.relics = list.filter(Boolean).sort(function (x, y) {
            return Number(x.id - y.id);
          });
          renderRelics();
        });
      }).catch(function (err) { console.warn("[dash] relics failed", err); });
  }

  function renderRelics() {
    var grid = $("dash-relics"), empty = $("dash-relics-empty");
    var list = state.relics;
    $("dash-relic-count").textContent = list.length ? "(" + list.length + ")" : "";
    if (!list.length) {
      grid.hidden = true; empty.hidden = false;
      if (!nftLive) empty.querySelector("p").textContent =
        "No relics in this wallet yet — the mint opens October 3. Each relic adds weekly weight while it's pledged.";
      return;
    }
    empty.hidden = true; grid.hidden = false;
    grid.innerHTML = "";
    list.forEach(function (r) {
      var card = document.createElement("div");
      card.className = "relic-card" + (r.rested ? " is-rested" : "") + (r.redeemed ? " is-redeemed" : "");
      var img = document.createElement("img");
      img.src = "assets/" + TIER_ART[r.tier];
      img.alt = TIER_NAMES[r.tier] + " relic";
      img.loading = "lazy";
      var body = document.createElement("div");
      body.className = "relic-body";
      var name = document.createElement("p");
      name.className = "relic-name";
      name.textContent = "MEGAMUSE #" + r.id.toString();
      var tier = document.createElement("p");
      tier.className = "relic-tier tier-" + r.tier;
      tier.textContent = TIER_NAMES[r.tier] + " · +" + state.tierW[r.tier];
      body.appendChild(name); body.appendChild(tier);
      card.appendChild(img); card.appendChild(body);
      if (r.redeemed) {
        var rd = document.createElement("p");
        rd.className = "relic-status redeemed";
        rd.textContent = "REDEEMED";
        body.appendChild(rd);
      } else {
        var tg = document.createElement("button");
        tg.className = "pledge-toggle" + (r.rested ? "" : " on");
        tg.setAttribute("aria-pressed", r.rested ? "false" : "true");
        tg.innerHTML = "<span class=\"knob\"></span><span class=\"pt-label\">" +
          (r.rested ? "Rested" : "Pledged") + "</span>";
        tg.title = r.rested ? "Pledge into the draw" : "Rest for a week";
        tg.addEventListener("click", function () { togglePledge(r, tg); });
        body.appendChild(tg);
      }
      grid.appendChild(card);
    });
  }

  function togglePledge(relic, btn) {
    if (!window.ethereum || !state.account) return;
    var toRest = !relic.rested; // pledged -> rest, rested -> pledge
    btn.disabled = true;
    setStatus("dash-buy-status", toRest ? "Resting relic…" : "Pledging relic…");
    var data = SEL.setRested + encUint(relic.id) + encUint(toRest ? 1 : 0);
    window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, to: NFT, data: data }]
    }).then(function () {
      relic.rested = toRest;
      renderRelics();
      setStatus("dash-buy-status", toRest ? "Relic rested — sitting this week out." : "Relic pledged — in every draw.");
    }).catch(function (err) {
      console.warn("[dash] setRested failed", err);
      setStatus("dash-buy-status", "Transaction rejected or failed.");
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- buy / free ---------- */
  var qty = 1;
  function setStatus(id, msg) { var el = $(id); if (el) el.textContent = msg || ""; }

  function sendTx(to, data, onOk, statusId, working) {
    setStatus(statusId, working);
    return window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, to: to, data: data }]
    }).then(function (hash) {
      setStatus(statusId, "Sent — waiting for confirmation…");
      return pollReceipt(hash).then(function () {
        setStatus(statusId, "");
        if (onOk) onOk();
      });
    }).catch(function (err) {
      console.warn("[dash] tx failed", err);
      setStatus(statusId, "Transaction rejected or failed.");
    });
  }
  function pollReceipt(hash) {
    return new Promise(function (resolve) {
      var tries = 0;
      (function tickR() {
        fetch(cfg.RPC_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if ((j.result && j.result.status) || ++tries > 40) resolve();
          else setTimeout(tickR, 3000);
        }).catch(function () { resolve(); });
      })();
    });
  }

  function buyOfferings() {
    if (!window.ethereum || !state.account || !gameLive || !cfg.isLive(TOKEN)) return;
    var count = qty;
    var cost = state.offeringPrice * BigInt(count);
    setStatus("dash-buy-status", "Checking MNEME allowance…");
    ethCall(TOKEN, SEL.allowance + encAddr(state.account) + encAddr(VAULT))
      .then(function (al) {
        if (al < cost) {
          return sendTx(TOKEN, SEL.approve + encAddr(VAULT) + encUint(cost),
            function () { doBuy(count, cost); }, "dash-buy-status", "Approving MNEME…");
        }
        doBuy(count, cost);
      }).catch(function (err) {
        console.warn("[dash] allowance check failed", err);
        setStatus("dash-buy-status", "Couldn't read allowance.");
      });
  }
  function doBuy(count, cost) {
    sendTx(ENGINE, SEL.buyOfferings + encUint(count), function () {
      setStatus("dash-buy-status", "Bought " + count + " offering" + (count > 1 ? "s" : "") + " — good luck.");
      loadWallet();
    }, "dash-buy-status", "Buying " + count + " offering" + (count > 1 ? "s" : "") + "…");
  }
  function claimFree() {
    if (!window.ethereum || !state.account || !gameLive) return;
    sendTx(ENGINE, SEL.claimFree, function () {
      setStatus("dash-buy-status", "Free entry claimed — you're in this week.");
      loadWallet();
    }, "dash-buy-status", "Claiming free entry…");
  }

  /* ---------- prizes ---------- */
  function checkPrizes() {
    var a = state.account;
    if (!a || !gameLive || state.epoch === 0n) return Promise.resolve();
    var found = [];
    var ps = [];
    for (var e = Number(state.epoch) - 1; e >= Math.max(1, Number(state.epoch) - 8); e--) {
      (function (ep) {
        // claims returns a tuple; decode the raw return data
        ps.push(fetch(cfg.RPC_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
              params: [{ to: ENGINE, data: SEL.claims + encUint(ep) }, "latest"] })
          }).then(function (r) { return r.json(); }).then(function (j) {
            if (!j.result || j.result === "0x") return;
            var hex = j.result.replace(/^0x/, "");
            var winner = "0x" + hex.slice(24, 64);
            var amount = BigInt("0x" + hex.slice(64, 128));
            var claimed = hex.slice(192, 256) !== "0".repeat(64);
            if (winner.toLowerCase() === a.toLowerCase() && !claimed && amount > 0n) {
              found.push({ epoch: ep, amount: amount });
            }
          }).catch(function () {}));
      })(e);
    }
    return Promise.all(ps).then(function () {
      var zone = $("dash-claim-zone");
      if (found.length) {
        zone.hidden = false;
        var total = found.reduce(function (s, f) { return s + f.amount; }, 0n);
        $("dash-win-msg").textContent = "You won " + fmtUnits(total, state.musebookDec) +
          " musebook across " + found.length + " draw" + (found.length > 1 ? "s" : "") + ".";
        state.unclaimed = found;
      } else {
        zone.hidden = true;
      }
    });
  }
  function claimPrize() {
    var list = state.unclaimed || [];
    if (!list.length || !window.ethereum || !state.account) return;
    var next = function (i) {
      if (i >= list.length) { loadWallet(); return; }
      sendTx(ENGINE, SEL.claimPrize + encUint(list[i].epoch), function () { next(i + 1); },
        "dash-claim-status", "Claiming epoch " + list[i].epoch + "…");
    };
    next(0);
  }

  /* ---------- wiring ---------- */
  function init() {
    setBadge();
    if (!gameLive) {
      $("dash-buy").disabled = true;
      $("dash-free").disabled = true;
    }
    var wallet = window.MnemeWallet;
    if (wallet) {
      if (wallet.account) onAccount(wallet.account);
      var cb = $("dash-connect");
      if (cb) cb.addEventListener("click", function () {
        wallet.connect().catch(function () {});
      });
    }
    window.addEventListener("mneme:account", function (e) {
      onAccount(e.detail && e.detail.account);
    });

    $("dash-qty-minus").addEventListener("click", function () {
      qty = Math.max(1, qty - 1); $("dash-qty").textContent = qty;
    });
    $("dash-qty-plus").addEventListener("click", function () {
      qty = Math.min(99, qty + 1); $("dash-qty").textContent = qty;
    });
    $("dash-buy").addEventListener("click", buyOfferings);
    $("dash-free").addEventListener("click", claimFree);
    var claimBtn = $("dash-claim");
    if (claimBtn) claimBtn.addEventListener("click", claimPrize);

    loadPublic().then(function () { tick(); });
    setInterval(tick, 1000);
    // refresh public state every 60s
    setInterval(loadPublic, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
