/* MNEME studio site — on-page swap widget.
   Exact-input swaps on the MNEME/musebook Uniswap v4 pool (Robinhood Chain)
   through the canonical UniversalRouter v2.1.1. Calldata path was proven on a
   mainnet fork before shipping:
     1. permit2.approve(inputToken, UNIVERSAL_ROUTER, 2**160-1, 2**48-1)  (one-time)
     2. UR.execute([V4_SWAP], [plan], deadline) with plan =
        SETTLE(input, amountIn, payerIsUser=true) ->
        SWAP_EXACT_IN_SINGLE(poolKey, zeroForOne, amountIn, minOut, 0, 0x) ->
        TAKE(output, user, 0)
   Quotes come from the canonical V4Quoter (returns directly, no revert games).
   Wallet connect / chain switching is handled by window.MnemeWallet (app.js). */
(function () {
  "use strict";

  var cfg = window.MNEME_CONFIG || {};
  var VIEM_URL = "https://esm.sh/viem@2.56.9";
  var SLIPPAGE_BPS = 200; // 2%
  var DEADLINE_SECS = 20 * 60;
  var CHAIN_HEX = "0x" + (cfg.CHAIN_ID || 4663).toString(16);

  function $(id) { return document.getElementById(id); }

  var els = {
    card: $("swap-card"), in: $("swap-in"), out: $("swap-out"),
    tokenIn: $("swap-token-in"), tokenOut: $("swap-token-out"),
    balIn: $("swap-bal-in"), max: $("swap-max"),
    details: $("swap-details"), rate: $("swap-rate"),
    impact: $("swap-impact"), min: $("swap-min"),
    status: $("swap-status"), primary: $("swap-primary"),
    dirs: Array.prototype.slice.call(document.querySelectorAll(".swap-dir"))
  };
  if (!els.card || !els.in) return; // markup missing — stay out of the way

  var UR = cfg.UNIVERSAL_ROUTER, QUOTER = cfg.V4_QUOTER, PERMIT2 = cfg.PERMIT2;
  var POOL_KEY = cfg.POOL_KEY || {};
  var MNEME = cfg.MNEME_TOKEN_ADDRESS, MUSEBOOK = cfg.MUSEBOOK_ADDRESS;
  if (!UR || !QUOTER || !PERMIT2 || !cfg.isLive(MNEME)) {
    setStatus("Swaps aren't wired up yet — the Dexscreener link below still works.", "err");
    els.primary.hidden = true;
    return;
  }

  var SINGLE_V211 = "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)";
  var quoterAbi = [{
    name: "quoteExactInputSingle", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "poolKey", type: "tuple", components: [
        { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }]},
      { name: "zeroForOne", type: "bool" }, { name: "exactAmount", type: "uint128" }, { name: "hookData", type: "bytes" }]}],
    outputs: [{ name: "amountOut", type: "uint256" }, { name: "gasEstimate", type: "uint256" }]
  }];
  var permit2Abi = [
    { name: "allowance", type: "function", stateMutability: "view",
      inputs: [{ name: "owner", type: "address" }, { name: "token", type: "address" }, { name: "spender", type: "address" }],
      outputs: [{ name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] },
    { name: "approve", type: "function", stateMutability: "nonpayable",
      inputs: [{ name: "token", type: "address" }, { name: "spender", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }],
      outputs: [] }
  ];
  var erc20Abi = [
    { name: "balanceOf", type: "function", stateMutability: "view",
      inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "allowance", type: "function", stateMutability: "view",
      inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
    { name: "approve", type: "function", stateMutability: "nonpayable",
      inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
    { name: "decimals", type: "function", stateMutability: "view",
      inputs: [], outputs: [{ type: "uint8" }] }
  ];
  var urAbi = [{ name: "execute", type: "function", stateMutability: "payable",
    inputs: [{ name: "commands", type: "bytes" }, { name: "inputs", type: "bytes[]" }, { name: "deadline", type: "uint256" }],
    outputs: [] }];

  var V; // viem namespace, loaded async
  var publicClient = null;
  var direction = "buy"; // buy = pay musebook, receive MNEME
  var account = null;
  var quoteTimer = null;
  var lastQuote = null; // { amountIn, amountOut, minOut, inputToken, outputToken, zeroForOne }
  var balances = {};
  var busy = false;

  init();

  function inputToken() { return direction === "buy" ? MUSEBOOK : MNEME; }
  function outputToken() { return direction === "buy" ? MNEME : MUSEBOOK; }
  function inputLabel() { return direction === "buy" ? "musebook" : "MNEME"; }
  function outputLabel() { return direction === "buy" ? "MNEME" : "musebook"; }

  function setStatus(html, cls) {
    els.status.innerHTML = html;
    els.status.className = "swap-status" + (cls ? " " + cls : "");
  }
  function setPrimary(label, opts) {
    opts = opts || {};
    els.primary.textContent = label;
    els.primary.hidden = !!opts.hidden;
    els.primary.disabled = !!opts.disabled;
  }

  function fmt(amount, decimals) {
    var n = Number(amount) / Math.pow(10, decimals == null ? 18 : decimals);
    if (!isFinite(n)) return "–";
    if (n === 0) return "0";
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return String(Number(n.toFixed(4)));
    return String(Number(n.toPrecision(4)));
  }
  function fmtRate(amountOut, amountIn) {
    if (amountIn === 0n) return "–";
    var r = Number(amountOut) / Number(amountIn);
    if (!isFinite(r) || r === 0) return "–";
    return r >= 1000 ? r.toLocaleString("en-US", { maximumFractionDigits: 1 })
      : r >= 1 ? String(Number(r.toFixed(4))) : r.toPrecision(4);
  }

  function parseInput() {
    var s = els.in.value.trim().replace(/,/g, "");
    if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
    try {
      var v = V.parseUnits(s, 18);
      return v > 0n ? v : null;
    } catch (e) { return null; }
  }

  async function init() {
    try {
      V = await import(VIEM_URL);
    } catch (e) {
      setStatus("Couldn't load the swap engine (network hiccup) — the Dexscreener link below still works.", "err");
      setPrimary("Swap", { hidden: true });
      return;
    }
    publicClient = V.createPublicClient({
      chain: { id: cfg.CHAIN_ID, name: cfg.CHAIN_NAME, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [cfg.RPC_URL] } } },
      transport: V.http(cfg.RPC_URL)
    });

    els.dirs.forEach(function (b) {
      b.addEventListener("click", function () {
        if (busy) return;
        direction = b.getAttribute("data-dir");
        els.dirs.forEach(function (x) { x.classList.toggle("active", x === b); });
        els.tokenIn.textContent = inputLabel();
        els.tokenOut.textContent = outputLabel();
        lastQuote = null;
        refreshBalances().then(scheduleQuote);
      });
    });
    els.in.addEventListener("input", scheduleQuote);
    els.max.addEventListener("click", function () {
      var t = inputToken();
      if (balances[t] != null) {
        els.in.value = V.formatUnits(balances[t], 18);
        scheduleQuote();
      }
    });
    els.primary.addEventListener("click", onPrimary);
    window.addEventListener("mneme:account", function (ev) {
      account = (ev.detail && ev.detail.account) || null;
      lastQuote = null;
      refreshBalances().then(updateActionState);
    });

    account = (window.MnemeWallet && window.MnemeWallet.account) || null;
    if (!window.ethereum) {
      setStatus("No wallet detected — open this page in a wallet browser (or install one) to trade.", "err");
      setPrimary("No wallet", { disabled: true });
      return;
    }
    refreshBalances().then(updateActionState);
  }

  function scheduleQuote() {
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(runQuote, 500);
  }

  async function runQuote() {
    var amountIn = parseInput();
    var myInput = els.in.value;
    lastQuote = null;
    els.out.value = "";
    els.details.hidden = true;
    if (!amountIn) { updateActionState(); return; }
    setStatus("Fetching quote…");
    setPrimary("…", { disabled: true });
    try {
      var inT = inputToken(), outT = outputToken();
      var zeroForOne = inT.toLowerCase() === MNEME.toLowerCase();
      var quoted = await publicClient.readContract({
        address: QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ poolKey: POOL_KEY, zeroForOne: zeroForOne, exactAmount: amountIn, hookData: "0x" }]
      });
      var amountOut = quoted[0];
      // spot quote at a small size for price impact
      var spotIn = direction === "buy" ? V.parseUnits("10", 18) : V.parseUnits("10000", 18);
      var spotOut = (await publicClient.readContract({
        address: QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ poolKey: POOL_KEY, zeroForOne: zeroForOne, exactAmount: spotIn, hookData: "0x" }]
      }))[0];
      if (els.in.value !== myInput) return; // user kept typing — a fresher quote is on its way
      var minOut = amountOut * BigInt(10000 - SLIPPAGE_BPS) / 10000n;
      lastQuote = { amountIn: amountIn, amountOut: amountOut, minOut: minOut, inputToken: inT, outputToken: outT, zeroForOne: zeroForOne };

      els.out.value = fmt(amountOut, 18);
      var execRate = Number(amountOut) / Number(amountIn);
      var spotRate = Number(spotOut) / Number(spotIn);
      var impact = spotRate > 0 ? Math.max(0, (1 - execRate / spotRate) * 100) : 0;
      els.rate.textContent = "1 " + inputLabel() + " ≈ " + fmtRate(amountOut, amountIn) + " " + outputLabel();
      els.impact.textContent = impact < 0.01 ? "< 0.01%" : impact.toFixed(2) + "%";
      els.min.textContent = fmt(minOut, 18) + " " + outputLabel();
      els.details.hidden = false;
      setStatus("Quote is live from the pool — valid for this block. It refreshes as you type.", "");
    } catch (e) {
      console.warn("[swap] quote failed", e);
      setStatus("No quote for that size — try a smaller amount.", "err");
      lastQuote = null;
    }
    updateActionState();
  }

  async function refreshBalances() {
    if (!account || !publicClient) return;
    try {
      var results = await publicClient.multicall({
        contracts: [
          { address: MUSEBOOK, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: MNEME, abi: erc20Abi, functionName: "balanceOf", args: [account] }
        ]
      });
      if (results[0].status === "success") balances[MUSEBOOK] = results[0].result;
      if (results[1].status === "success") balances[MNEME] = results[1].result;
      var b = balances[inputToken()];
      els.balIn.textContent = b != null ? fmt(b, 18) + " " + inputLabel() : "–";
      els.max.hidden = !(b != null && b > 0n);
    } catch (e) { /* balances are best-effort */ }
  }

  async function permit2Allowance(token) {
    var r = await publicClient.readContract({
      address: PERMIT2, abi: permit2Abi, functionName: "allowance",
      args: [account, token, UR]
    });
    return r[0];
  }

  /* Approval stack for SETTLE(payerIsUser=true):
     1. ERC-20 allowance(user -> Permit2) — so Permit2 can pull the input token
     2. Permit2 allowance(user, token -> UniversalRouter) — so UR can pull via Permit2
     Both are one-time; returns "erc20" | "permit2" | "ok". */
  async function approvalNeeded(token, amountIn) {
    var erc = await publicClient.readContract({
      address: token, abi: erc20Abi, functionName: "allowance", args: [account, PERMIT2]
    });
    if (erc < amountIn) return "erc20";
    var p2 = await permit2Allowance(token);
    return p2 < amountIn ? "permit2" : "ok";
  }

  async function updateActionState() {
    if (busy) return;
    if (!window.ethereum) { setPrimary("No wallet", { disabled: true }); return; }
    if (!account) {
      setStatus("Connect your wallet to trade.", "");
      setPrimary("Connect wallet", {});
      return;
    }
    var amountIn = parseInput();
    if (!amountIn) {
      setStatus("Enter an amount to get a live quote.", "");
      setPrimary("Enter an amount", { disabled: true });
      return;
    }
    var bal = balances[inputToken()];
    if (bal != null && amountIn > bal) {
      setStatus("Insufficient " + inputLabel() + " balance.", "err");
      setPrimary("Insufficient balance", { disabled: true });
      return;
    }
    if (!lastQuote) { setPrimary("…", { disabled: true }); return; }
    try {
      var need = await approvalNeeded(lastQuote.inputToken, lastQuote.amountIn);
      if (need === "erc20") {
        setStatus("One-time approval: let Permit2 (Uniswap's audited token-permission contract) move your " + inputLabel() + ".", "");
        setPrimary("Approve " + inputLabel(), {});
      } else if (need === "permit2") {
        setStatus("One-time approval: let the Universal Router (Uniswap's audited swap contract) pull your " + inputLabel() + " through Permit2 for swaps.", "");
        setPrimary("Approve " + inputLabel(), {});
      } else {
        setPrimary(direction === "buy" ? "Buy MNEME" : "Sell MNEME", {});
      }
    } catch (e) {
      setStatus("Couldn't check approvals — try reconnecting.", "err");
      setPrimary("Swap", { disabled: true });
    }
  }

  async function sendTx(to, data) {
    var chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (!chainId || chainId.toLowerCase() !== CHAIN_HEX.toLowerCase()) {
      throw new Error("wrong network — switch your wallet to Robinhood Chain and try again");
    }
    return window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: to, data: data }]
    });
  }

  function txLink(hash) {
    return ' <a href="' + cfg.EXPLORER_TX + hash + '" target="_blank" rel="noopener">view tx</a>';
  }

  function explain(err) {
    var m = (err && err.message) || String(err);
    if (err && err.code === 4001) return "Transaction rejected in your wallet.";
    if (/wrong network/i.test(m)) return m;
    if (/insufficient funds/i.test(m)) return "Insufficient balance for this trade (or for gas).";
    if (m.indexOf("0xd81b2f2e") >= 0) return "Approval missing or expired — approve again, then swap.";
    if (/0x39d35496|TooLittleReceived/i.test(m)) return "Price moved past 2% slippage — quote again and retry.";
    return "Swap failed: " + m.slice(0, 140);
  }

  async function onPrimary() {
    if (busy) return;
    if (!account) {
      try { await window.MnemeWallet.connect(); }
      catch (e) { setStatus("Wallet connection failed.", "err"); }
      return;
    }
    var q = lastQuote;
    if (!q || !parseInput()) return;
    busy = true;
    try {
      var need = await approvalNeeded(q.inputToken, q.amountIn);
      if (need === "erc20") {
        setPrimary("Approving…", { disabled: true });
        setStatus("Confirm the approval in your wallet…", "");
        var ercData = V.encodeFunctionData({
          abi: erc20Abi, functionName: "approve", args: [PERMIT2, V.maxUint256]
        });
        var eh = await sendTx(q.inputToken, ercData);
        setStatus("Approval sent — waiting for confirmation…" + txLink(eh), "");
        await publicClient.waitForTransactionReceipt({ hash: eh });
        need = await approvalNeeded(q.inputToken, q.amountIn);
      }
      if (need === "permit2") {
        setPrimary("Approving…", { disabled: true });
        setStatus("Confirm the approval in your wallet…", "");
        var approveData = V.encodeFunctionData({
          abi: permit2Abi, functionName: "approve",
          args: [q.inputToken, UR, V.maxUint160, V.maxUint48]
        });
        var ah = await sendTx(PERMIT2, approveData);
        setStatus("Approval sent — waiting for confirmation…" + txLink(ah), "");
        await publicClient.waitForTransactionReceipt({ hash: ah });
        setStatus("Approved. Re-quoting for a fresh price…", "ok");
        await runQuote();
        q = lastQuote;
        if (!q) throw new Error("quote went stale after approval — enter the amount again");
      }
      setPrimary("Swapping…", { disabled: true });
      setStatus("Confirm the swap in your wallet…", "");
      var deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECS);
      var settle = V.encodeAbiParameters(V.parseAbiParameters("address currency, uint256 amount, bool payerIsUser"),
        [q.inputToken, q.amountIn, true]);
      var swapSingle = V.encodeAbiParameters(V.parseAbiParameters([SINGLE_V211]), [[
        [POOL_KEY.currency0, POOL_KEY.currency1, POOL_KEY.fee, POOL_KEY.tickSpacing, POOL_KEY.hooks],
        q.zeroForOne, q.amountIn, q.minOut, 0n, "0x"]]);
      var take = V.encodeAbiParameters(V.parseAbiParameters("address currency, address recipient, uint256 amount"),
        [q.outputToken, account, 0n]);
      var actions = V.concat([V.toHex(11, { size: 1 }), V.toHex(6, { size: 1 }), V.toHex(14, { size: 1 })]);
      var plan = V.encodeAbiParameters(V.parseAbiParameters("bytes actions, bytes[] params"),
        [actions, [settle, swapSingle, take]]);
      var data = V.encodeFunctionData({
        abi: urAbi, functionName: "execute",
        args: [V.toHex(16, { size: 1 }), [plan], deadline]
      });
      var h = await sendTx(UR, data);
      setStatus("Swap sent — waiting for confirmation…" + txLink(h), "");
      var rcpt = await publicClient.waitForTransactionReceipt({ hash: h });
      if (rcpt.status !== "success") throw new Error("transaction reverted on-chain");
      setStatus("Swapped." + txLink(h), "ok");
      await refreshBalances();
      lastQuote = null;
      els.in.value = "";
      els.out.value = "";
      els.details.hidden = true;
    } catch (e) {
      console.warn("[swap] action failed", e);
      setStatus(explain(e), "err");
    }
    busy = false;
    updateActionState();
  }
})();
