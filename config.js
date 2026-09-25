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

    // --- MNEME token (launched 2026-09-25 ~10:01 ET on Bankr, Robinhood Chain) ---
    MNEME_TOKEN_ADDRESS: "0x86bFDCC224f5590DCAc42b092b4e66B471934Ba3",

    // --- quote asset (musebook, fixed) ---
    MUSEBOOK_ADDRESS: "0x91A2DAe9699f0B82540B5886b0d8759C22820bA3",

    // --- Bankr Uniswap v4 pool key (live since 2026-09-25 launch) ---
    POOL_KEY: {
      currency0: "0x86bFDCC224f5590DCAc42b092b4e66B471934Ba3", // MNEME
      currency1: "0x91A2DAe9699f0B82540B5886b0d8759C22820bA3", // musebook
      fee: 8388608, // DYNAMIC_FEE_FLAG
      tickSpacing: 200,
      hooks: "0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544"
    },

    // --- MEGAMUSE NFT contract (deploys before Oct 3 mint) ---
    MEGAMUSE_NFT_ADDRESS: ZERO,

    // --- MEGAMUSE engine + vault (deploy after the mint; dashboard keys off these) ---
    // Fill in after deployment. Until then the Play dashboard shows "—" states.
    MEGAMUSE_ENGINE_ADDRESS: ZERO,
    MEGAMUSE_VAULT_ADDRESS: ZERO,

    // --- Dexscreener (pair indexed 2026-09-25) ---
    DEXSCREENER_PAIR_URL: "https://dexscreener.com/robinhood/0x9f54bc47e331a5cca760e848f313808b364d54791ee4ee37a8adbe04afb26f40",

    // --- Uniswap periphery (Robinhood Chain) — used by the on-site swap widget ---
    // UniversalRouter v2.1.1 (canonical Uniswap deployment on 4663; checksummed per EIP-55)
    UNIVERSAL_ROUTER: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    // V4Quoter (canonical Uniswap deployment on 4663)
    V4_QUOTER: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
    // Permit2 (canonical cross-chain deployment)
    PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    // block explorer tx links
    EXPLORER_TX: "https://robinhoodchain.blockscout.com/tx/",

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
