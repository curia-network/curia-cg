got it. here’s a dead‑simple “url recipe” your cursor agent can follow to generate deterministic links for **LSP7** (and decent fallbacks for **LSP8**) on lukso.

# the gist (for the agent)

* **where to send users to *acquire***
  use the **trading ui**:
  `https://universalswaps.io/tokens/lukso/<LSP7_CONTRACT_ADDRESS>` — this opens the token’s trade page on UniversalSwaps (lukso network).

* **where to send users to *view analytics / info***
  use the **info site**:
  `https://info.universalswaps.io/#/tokens/<LSP7_CONTRACT_ADDRESS>` — this is the token analytics page (pairs, volume, etc.). This pattern is widely used in the wild.
  *(you’ll also see older/shared links like `#/tokens/tokens/<address>` floating around; the single `tokens/<address>` form is the clean one.)*

* **network assumption**
  UniversalSwaps today targets **LUKSO mainnet** (chain id **42**). Keep addresses on that chain and checksum them.

* **support reality check**
  UniversalSwaps explicitly supports **LSP7** trading (they’ve said “start trading LSP7 tokens”). For **LSP8** (NFTs / identifiable assets), UniversalSwaps isn’t the venue; use **Universal Page** links (collection or item).

# urls the agent should build

```ts
// LSP7 (fungible) — UniversalSwaps
// trade UI (acquire):
https://universalswaps.io/tokens/lukso/<LSP7_CONTRACT_ADDRESS>

// info / analytics:
https://info.universalswaps.io/#/tokens/<LSP7_CONTRACT_ADDRESS>

// optional: pair page if you know a specific pair address:
https://info.universalswaps.io/#/pairs/<PAIR_ADDRESS>
```

Examples of this exact shape are used publicly (that’s how users share tokens).

```ts
// LSP8 (identifiable / NFTs) — Universal Page (marketplace)
// collection page (always safe if you only know the contract):
https://universal.page/collections/lukso/<LSP8_CONTRACT_ADDRESS>

// specific item (if you also have a tokenId — numeric or string):
https://universal.page/collections/lukso/<LSP8_CONTRACT_ADDRESS>/<TOKEN_ID>

// alt viewer (nice “see the asset” fallback, requires tokenId as 32-byte hex):
https://universaleverything.io/asset/<LSP8_CONTRACT_ADDRESS>/tokenId/<0xPADDED_64_HEX>
```

You can see these exact `collections/lukso/<addr>/<id>` and `asset/<addr>/tokenId/<hex>` routes in the wild.
Universal Page is a first‑party marketplace for LSP7/LSP8 (“NFTs 2.0”), so it’s the right “acquire” place for LSP8.

# drop‑in typescript for cursor

give your agent a tiny url builder. it assumes you already know the standard (`"LSP7"` / `"LSP8"`), the `address`, and (for LSP8 items) optionally a `tokenId`.

```ts
import { getAddress as toChecksum } from "ethers"; // ethers v6

type TokenStandard = "LSP7" | "LSP8";
type Metadata = {
  standard: TokenStandard;
  address: string;            // contract address on LUKSO mainnet
  tokenId?: string | number;  // only for LSP8 items (can be number or string like "dot")
};

const LUKSO_CHAIN_ID = 42; // FYI only, all links below assume lukso mainnet. (chain id 42)

/**
 * Build deterministic URLs for a token so users can view info and acquire it.
 * For LSP7: UniversalSwaps (trade) + Info (analytics).
 * For LSP8: Universal Page (collection/item) + UniversalEverything viewer fallback.
 */
export function buildAcquisitionLinks(meta: Metadata) {
  const addr = toChecksum(meta.address); // EIP-55

  if (meta.standard === "LSP7") {
    const trade = `https://universalswaps.io/tokens/lukso/${addr}`;
    const info  = `https://info.universalswaps.io/#/tokens/${addr}`;
    return { standard: "LSP7", trade, info };
  }

  // LSP8
  const collection = `https://universal.page/collections/lukso/${addr}`;

  // if we have a tokenId, build direct item links
  let item: string | undefined;
  let viewerHex: string | undefined;

  if (meta.tokenId !== undefined && meta.tokenId !== null) {
    const tid = String(meta.tokenId); // universal.page accepts numeric or string ids
    item = `${collection}/${tid}`;
    // build 32-byte hex for the UniversalEverything viewer
    viewerHex = toBytes32Hex(tid);
  }

  const viewer = viewerHex
    ? `https://universaleverything.io/asset/${addr}/tokenId/${viewerHex}`
    : undefined;

  return { standard: "LSP8", collection, item, viewer };
}

/**
 * Convert an LSP8 tokenId to a 32-byte hex string:
 * - if tokenId is already 0x.. hex -> left-pad to 32 bytes
 * - if tokenId is decimal -> to BigInt -> hex -> left-pad
 * - else (string label, e.g. "dot") -> UTF-8 bytes -> left-pad
 */
function toBytes32Hex(tokenId: string): string {
  const hexRegex = /^0x[0-9a-fA-F]+$/;
  if (hexRegex.test(tokenId)) {
    return "0x" + tokenId.slice(2).padStart(64, "0");
  }
  if (/^\d+$/.test(tokenId)) {
    const n = BigInt(tokenId);
    return "0x" + n.toString(16).padStart(64, "0");
  }
  // utf-8 encode arbitrary string ids
  const bytes = new TextEncoder().encode(tokenId);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return "0x" + hex.padStart(64, "0").slice(0, 64); // truncate if >32 bytes
}
```

# practical notes / gotchas

* **checksum addresses**: universal swaps links work with lowercase, but checksumming avoids edge cases; also helps your ux.
* **pairs vs tokens**: the **info** page at `#/tokens/<addr>` is the canonical “analytics” link. If you already know a specific **pair** contract, you *can* deep‑link to `#/pairs/<pairAddress>`.
* **wlyx vs lyx**: most lsp7s trade against **WLYX** on UniversalSwaps; the trade page above will present available pairs. (UniversalSwaps is the DEX used by CoinGecko for LUKSO token markets.)
* **lsp8 availability**: buying lsp8s is marketplace‑style (listings / offers), not swaps. That’s why we route to **Universal Page** for “acquire”; use the collection page if you don’t have a specific tokenId.
* **chain id**: keep your metadata scoped to **lukso mainnet (42)**; if you ever support testnet (4201), guard your urls accordingly (UniversalSwaps/UP links may differ or be mainnet‑only).

if you want, i can wrap this into a tiny npm module or add a quick unit test file that feeds a few real lukso contracts + tokenIds and asserts the output urls.
