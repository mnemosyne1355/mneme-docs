/* MNEME studio site — chain configuration.
   Single source of truth for every on-chain read/write in the UI.
   Placeholders are the zero address / empty string — fill them in as contracts deploy. */
(function () {
  "use strict";

  var ZERO = "0x0000000000000000000000000000000000000000";

  window.MNEME_CONFIG = {
    // --- chain ---
    CHAIN_ID: 4663,
    CHAIN_NAME: "Robinhood Chain",
    RPC_URL: "https://rpc.mainnet.chain.robinhood.com",
    NATIVE_SYMBOL: "ETH",

    // --- MNEME token (launches ~8pm ET 2026-09-24 on Bankr) ---
    // Fill in after launch. Everything else keys off this.
    MNEME_TOKEN_ADDRESS: ZERO,

    // --- quote asset (musebook, fixed) ---
    MUSEBOOK_ADDRESS: "0x91A2DAe9699f0B82540B5886b0d8759C22820bA3",

    // --- Bankr Uniswap v4 pool key (fill in after launch) ---
    POOL_KEY: {
      currency0: ZERO,
      currency1: ZERO,
      fee: 0,
      tickSpacing: 0,
      hooks: ZERO
    },

    // --- MEGAMUSE NFT contract (deploys before Oct 3 mint) ---
    MEGAMUSE_NFT_ADDRESS: ZERO,

    // --- Dexscreener (fill in once the pair is indexed) ---
    // e.g. "https://dexscreener.com/robinhood/0xPAIR..."
    DEXSCREENER_PAIR_URL: "",

    // --- mint canon (matches Megamuse.sol constants) ---
    MINT: {
      PRICE_ETH: "0.01",
      MAX_PER_WALLET: 5,
      SUPPLY: 3333,
      OPENS_LABEL: "October 3"
    }
  };

  // true when an address is a real configured address (not the placeholder)
  window.MNEME_CONFIG.isLive = function (addr) {
    return typeof addr === "string" && /^0x[1-9a-fA-F]/.test(addr);
  };
})();
