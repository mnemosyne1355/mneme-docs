/* MNEME studio site — mint interface.
   Zero dependencies: raw window.ethereum + JSON-RPC. No CDN, nothing to break.
   Placeholder-first: if the NFT contract isn't configured yet, only the
   "mint opens October 3" panel shows. No wallet code runs, no dead clicks.

   Function selectors below are from Megamuse.sol, verified with cast. */
(function () {
  "use strict";

  var cfg = window.MNEME_CONFIG;
  if (!cfg) return;

  var soonEl = document.getElementById("mint-soon");
  var liveEl = document.getElementById("mint-live");
  if (!soonEl || !liveEl) return;

  // NFT contract not deployed yet → placeholder state, nothing else to do.
  if (!cfg.isLive(cfg.MEGAMUSE_NFT_ADDRESS)) {
    soonEl.hidden = false;
    liveEl.hidden = true;
    return;
  }
  soonEl.hidden = true;
  liveEl.hidden = false;

  var SEL = {
    mint:        "0xa0712d68", // mint(uint256)
    totalMinted: "0xa2309ff8", // totalMinted()
    mintedBy:    "0x3cef28d2", // mintedBy(address)
    mintOpen:    "0x24bbd049", // mintOpen()
    PRICE:       "0x8d859f3e", // PRICE()
    SUPPLY:      "0xc50497ae", // SUPPLY()
    WALLET_LIMIT:"0x351ed951"  // WALLET_LIMIT()
  };

  var NFT = cfg.MEGAMUSE_NFT_ADDRESS;
  var CHAIN_HEX = "0x" + cfg.CHAIN_ID.toString(16);

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { var el = $("mint-status"); if (el) el.textContent = msg; }
  function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function pad32(hex) { hex = hex.replace(/^0x/, ""); return "0x" + hex.padStart(64, "0"); }
  function formatEther(wei) {
    var s = wei.toString().padStart(19, "0");
    var whole = s.slice(0, -18).replace(/^0+(?=\d)/, "");
    var frac = s.slice(-18).replace(/0+$/, "");
    return frac ? whole + "." + frac : whole;
  }

  // --- public RPC reads (no wallet needed) ---
  function ethCall(data) {
    return fetch(cfg.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: NFT, data: data }, "latest"] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    });
  }
  function readUint(sel, arg) {
    var data = arg ? sel + pad32(arg).slice(2) : sel;
    return ethCall(data).then(function (hex) { return BigInt(hex); });
  }
  function setMinted(minted, total) {
    var bar = $("mint-bar"), label = $("mint-count");
    if (bar) bar.style.width = Math.min(100, Number(minted) / Number(total) * 100) + "%";
    if (label) label.textContent = Number(minted).toLocaleString("en-US");
  }

  var priceWei = BigInt(Math.round(parseFloat(cfg.MINT.PRICE_ETH) * 1e18));
  var walletLimit = cfg.MINT.MAX_PER_WALLET;
  var supply = BigInt(cfg.MINT.SUPPLY);
  var qty = 1;
  var account = null;

  function refreshTotal() {
    $("qty").textContent = qty;
    $("mint-total-eth").textContent = formatEther(priceWei * BigInt(qty));
  }

  // fire off the read-only state; each call fails independently
  Promise.all([
    readUint(SEL.totalMinted).then(function (m) { setMinted(m, supply); }).catch(function () {}),
    readUint(SEL.PRICE).then(function (p) { priceWei = p; refreshTotal(); }).catch(function () {}),
    readUint(SEL.SUPPLY).then(function (s) { supply = s; }).catch(function () {}),
    readUint(SEL.WALLET_LIMIT).then(function (w) { walletLimit = Number(w); }).catch(function () {}),
    readUint(SEL.mintOpen).then(function (o) {
      if (o === 0n) setStatus("mint is closed for now — check back soon.");
    }).catch(function () {})
  ]);
  refreshTotal();

  // --- wallet ---
  var connectBtn = $("mint-connect");
  var walletLine = $("mint-wallet");
  var controls = $("mint-controls");

  if (!window.ethereum) {
    connectBtn.disabled = true;
    connectBtn.textContent = "no wallet found";
    setStatus("no wallet detected in this browser — install one and come back.");
    return;
  }

  connectBtn.addEventListener("click", function () {
    setStatus("connecting…");
    window.ethereum.request({ method: "eth_requestAccounts" }).then(function (accounts) {
      account = accounts[0];
      return ensureChain().then(function () { return account; });
    }).then(function () {
      connectBtn.hidden = true;
      walletLine.hidden = false;
      walletLine.textContent = "connected: " + shortAddr(account);
      controls.hidden = false;
      setStatus("checking this wallet's mints…");
      return readUint(SEL.mintedBy, account).then(function (already) {
        var remaining = walletLimit - Number(already);
        if (remaining <= 0) {
          setStatus("this wallet already minted its " + walletLimit + " — nice collection.");
          $("mint-go").disabled = true;
        } else {
          setStatus("this wallet can mint " + remaining + " more.");
        }
      }).catch(function () {
        setStatus("connected — pick a quantity and mint.");
      });
    }).catch(function (err) {
      console.warn("[mint] connect failed", err);
      setStatus("couldn't connect — " + friendlyError(err));
    });
  });

  function ensureChain() {
    return window.ethereum.request({ method: "eth_chainId" }).then(function (id) {
      if (id.toLowerCase() === CHAIN_HEX.toLowerCase()) return;
      return window.ethereum.request({
        method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }]
      }).catch(function (err) {
        if (err && err.code === 4902) {
          return window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CHAIN_HEX,
              chainName: cfg.CHAIN_NAME,
              nativeCurrency: { name: "Ether", symbol: cfg.NATIVE_SYMBOL, decimals: 18 },
              rpcUrls: [cfg.RPC_URL]
            }]
          });
        }
        throw err;
      });
    });
  }

  // --- quantity ---
  $("qty-minus").addEventListener("click", function () { if (qty > 1) { qty--; refreshTotal(); } });
  $("qty-plus").addEventListener("click", function () { if (qty < walletLimit) { qty++; refreshTotal(); } });

  // --- mint ---
  $("mint-go").addEventListener("click", function () {
    if (!account) { setStatus("connect your wallet first."); return; }
    var goBtn = $("mint-go");
    goBtn.disabled = true;
    setStatus("sending your mint to the wallet — confirm there…");
    var valueHex = "0x" + (priceWei * BigInt(qty)).toString(16);
    window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: account,
        to: NFT,
        value: valueHex,
        data: SEL.mint + pad32("0x" + qty.toString(16)).slice(2)
      }]
    }).then(function (hash) {
      setStatus("mint sent — waiting for confirmation…");
      return waitForReceipt(hash);
    }).then(function () {
      setStatus("you're in — " + qty + " relic" + (qty > 1 ? "s" : "") + " minted. welcome to the draw.");
      return readUint(SEL.totalMinted).then(function (m) { setMinted(m, supply); }).catch(function () {});
    }).catch(function (err) {
      console.warn("[mint] mint failed", err);
      setStatus("mint didn't go through — " + friendlyError(err));
    }).then(function () { goBtn.disabled = false; });
  });

  function waitForReceipt(hash) {
    var tries = 0;
    return new Promise(function (resolve, reject) {
      (function poll() {
        tries++;
        fetch(cfg.RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt",
            params: [hash] })
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.result) return resolve(j.result);
          if (tries > 60) return reject(new Error("timed out waiting for confirmation"));
          setTimeout(poll, 2000);
        }).catch(function () {
          if (tries > 60) return reject(new Error("timed out waiting for confirmation"));
          setTimeout(poll, 2000);
        });
      })();
    });
  }

  function friendlyError(err) {
    if (!err) return "unknown error.";
    if (err.code === 4001) return "you rejected it in the wallet.";
    var msg = (err.message || "").toString();
    if (/insufficient funds/i.test(msg)) return "not enough ETH for the mint + gas.";
    return msg.slice(0, 120) || "unknown error.";
  }
})();
