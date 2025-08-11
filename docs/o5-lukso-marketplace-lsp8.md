perfect — here’s the **deterministic lsp8 url recipe** (same shape as your example) + a tiny builder your cursor agent can drop in.

# url patterns (lsp8 on lukso)

* **collection page** (good default if you don’t know the item id):
  `https://universal.page/collections/lukso/<LSP8_CONTRACT>` ([universal.page][1])

* **item page (acquire / offers / buy)**:
  `https://universal.page/collections/lukso/<LSP8_CONTRACT>/<TOKEN_ID>`
  `TOKEN_ID` can be either **decimal** (`3105`, `23`, `883`) or a **0x‑prefixed 32‑byte hex** (your example). Both resolve to the same item page and show marketplace actions like “make offer / place order.” ([universal.page][2])

* **viewer fallback (always works with bytes32)**:
  `https://universaleverything.io/asset/<LSP8_CONTRACT>/tokenId/<TOKEN_ID_HEX_32>` — handy if you only have the raw bytes32 id. ([universaleverything.io][3])

why this works: LSP8 tokenIds are **bytes32** and may represent numbers, strings, addresses, or hashes — so Universal Page accepts either the human **decimal** form or the canonical **0x… bytes32** form in the path. ([docs.lukso.tech][4])

# typescript helper (drop‑in)

```ts
import { getAddress as toChecksum } from "ethers"; // v6

type LSP8Input = {
  address: string;                     // LSP8 contract (lukso mainnet)
  tokenId: string | number | bigint;   // decimal (e.g. 4222) or 0x-hex (bytes32)
  // optional hint: "hex32" | "decimal" | "label"
  tokenIdFormat?: "hex32" | "decimal" | "label";
};

export function buildLSP8Links(input: LSP8Input) {
  const addr = toChecksum(input.address);
  const collection = `https://universal.page/collections/lukso/${addr}`;

  // what Universal Page accepts in the item route
  const itemToken = toUniversalPageTokenId(input.tokenId, input.tokenIdFormat);
  const item = `${collection}/${itemToken}`;

  // viewer fallback always uses 32-byte hex
  const hex32 = toHex32(input.tokenId, input.tokenIdFormat);
  const viewer = `https://universaleverything.io/asset/${addr}/tokenId/${hex32}`;

  return { collection, item, viewer };
}

/** 
 * Universal Page item route:
 * - if you pass a 0x… bytes32 -> keep it (deterministic & works)
 * - else pass a decimal string (UP supports plain decimals too)
 */
function toUniversalPageTokenId(
  id: string | number | bigint,
  hint?: "hex32" | "decimal" | "label"
): string {
  if (typeof id === "string" && id.startsWith("0x")) {
    return ensureHex32(id);
  }
  if (hint === "hex32") return ensureHex32(String(id));

  // decimal path is accepted by UP
  if (typeof id === "bigint" || typeof id === "number") return String(id);
  if (/^\d+$/.test(String(id))) return String(id);

  // last resort for string labels: use bytes32 hex (works for route & viewer)
  // NOTE: if the collection hashed labels when minting, you must use the stored bytes32 from metadata.
  return ensureHex32(utf8ToHex32(String(id)));
}

/** return 0x + 64 hex chars (left-padded) */
function ensureHex32(hex: string): string {
  const clean = hex.toLowerCase().startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-f]+$/i.test(clean)) throw new Error("invalid hex for tokenId");
  return "0x" + clean.padStart(64, "0").slice(-64);
}

/** convert id -> 0x…32 bytes (hex). works for numbers, 0x-hex, or short UTF-8 labels */
function toHex32(
  id: string | number | bigint,
  hint?: "hex32" | "decimal" | "label"
): string {
  if (typeof id === "string" && id.startsWith("0x")) return ensureHex32(id);
  if (hint === "hex32") return ensureHex32(String(id));

  if (typeof id === "bigint" || typeof id === "number" || /^\d+$/.test(String(id))) {
    const n = BigInt(id as any);
    return "0x" + n.toString(16).padStart(64, "0");
  }
  return ensureHex32(utf8ToHex32(String(id)));
}

function utf8ToHex32(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return "0x" + hex.padStart(64, "0").slice(0, 64); // truncate if >32 bytes
}
```

## examples (same contract you sent)

```ts
// bytes32 form (your example):
buildLSP8Links({
  address: "0x2b2eb8848d04c003231e4b905d5db6ebc0c02fa4",
  tokenId: "0x000000000000000000000000000000000000000000000000000000000000107e",
});
// => item: https://universal.page/collections/lukso/0x2B2eB8848D04c003231E4B905d5dB6eBc0c02fA4/0x000000000000000000000000000000000000000000000000000000000000107e

// decimal form (same NFT, because 0x107e == 4222):
buildLSP8Links({
  address: "0x2b2e…2fa4",
  tokenId: 4222,
});
// => item: https://universal.page/collections/lukso/<addr>/4222
```

### notes / gotchas

* **prefer bytes32 in links** if you already have the raw `tokenId` from metadata — it’s fully deterministic, and UP accepts it in the path (see your Based Baristas example). ([universal.page][5])
* **decimal also works** for collections that use numeric ids (lots of LUKSO collections do). ([universal.page][2])
* **if a collection used string labels or hashed ids**, you can’t derive the correct bytes32 from the human label; you must read the stored `bytes32` tokenId (LSP8 spec). ([docs.lukso.tech][4])
* **viewer fallback**: always build the universaleverything link from the bytes32 — it’s a reliable “see the asset” URL. ([universaleverything.io][3])

if you want, i can wrap this into a tiny `@lukso-links` util with tests and ship it as an npm package.

[1]: https://universal.page/collections/lukso/0xd1d18961ffeba233ba023e25e602f842d4a3d668?utm_source=chatgpt.com "CandyZap - Universal Page"
[2]: https://universal.page/collections/lukso/0x323b3f7aff4e60a13593401521b96197f3c59369/3105?utm_source=chatgpt.com "3105 | Collection - Universal Page"
[3]: https://universaleverything.io/asset/0xdf2d0ffc0b9422deb031f658537f7a6196d58bde/tokenId/0x0000000000000000000000000000000000000000000000000000000000000000?utm_source=chatgpt.com "Universal Everything"
[4]: https://docs.lukso.tech/standards/tokens/LSP8-Identifiable-Digital-Asset/?utm_source=chatgpt.com "LSP8 - Identifiable Digital Asset | LUKSO Tech Documentation"
[5]: https://universal.page/collections/lukso/0x2b2eb8848d04c003231e4b905d5db6ebc0c02fa4/0x000000000000000000000000000000000000000000000000000000000000107e "Based Baristas | Based Baristas"
