got it. here’s the complete, code-ready spec for your cursor agent, based on the lukso docs + packages. it shows exactly which npm libs to install and how to decide whether an LSP7 is divisible or not (including the LSP4 token type nuance from your slide).

goal

Classify any contract address on LUKSO as:
	•	LSP7 divisible
	•	LSP7 non-divisible
	•	not LSP7 (or unknown)

why (from docs)
	•	LSP7 may represent fungible tokens or multi-unit NFTs. The latter is non-divisible and is tagged via LSP4TokenType = 1. Fungible LSP7s have LSP4TokenType = 0.  ￼
	•	For fungible LSP7s, decimals() is the source of truth: 0 ⇒ non-divisible, >0 ⇒ divisible. (LSP7 spec: “If the token is non-divisible then 0 SHOULD be used; otherwise 18 is common.”)  ￼

install

# core rpc + abi/types
npm i viem                                # or: npm i ethers
npm i @lukso/lsp7-contracts               # ABIs + interface IDs for LSP7
npm i @lukso/lsp4-contracts               # LSP4 ERC725Y keys if you want them
npm i @erc725/erc725.js                   # read & decode ERC725Y (LSP4) data

	•	@lukso/lsp7-contracts exposes INTERFACE_ID_LSP7 and typed ABIs (nice for strict checks).  ￼
	•	@erc725/erc725.js decodes ERC725Y storage using LSP4 schemas (needed to read LSP4TokenType).  ￼
	•	The LSP4TokenType enum values are: 0 = Token, 1 = NFT, 2 = Collection.  ￼

detection pipeline (robust & fast)
	1.	Verify it’s LSP7 (ERC-165)
	•	Call supportsInterface(INTERFACE_ID_LSP7); if false ⇒ not LSP7.
	•	Interface IDs are provided by @lukso/lsp7-contracts.  ￼
	•	(ERC-165 detection pattern is standard.)  ￼
	2.	Read LSP4TokenType (ERC725Y)
	•	If LSP4TokenType = 1 (NFT) ⇒ LSP7 non-divisible by definition (your slide’s “multi-unit NFT”).
	•	If LSP4TokenType = 0 (Token) ⇒ go to step 3.
	•	If missing/unreadable ⇒ continue with step 3 but mark confidence lower.  ￼ ￼
	3.	Read decimals()
	•	If decimals() === 0 ⇒ LSP7 non-divisible.
	•	If decimals() > 0 ⇒ LSP7 divisible.
	•	If the call reverts or fn not present (shouldn’t, but older or buggy impls exist) ⇒ treat as unknown, optionally run the sanity check below.  ￼
	4.	(Optional) Sanity check via call-static transfer
	•	Simulate a transfer of a fractional amount (e.g., 1 * 10^(decimals-1)):
	•	Revert / rounding ⇒ effectively non-divisible.
	•	Success ⇒ divisible.
	•	Only do this if you lack confidence from steps 2–3.

viem implementation (recommended)

import { createPublicClient, http, getContract } from 'viem';
import { lsp7DigitalAssetAbi } from '@lukso/lsp7-contracts/abi';
import { INTERFACE_ID_LSP7 } from '@lukso/lsp7-contracts';
import { ERC725 } from '@erc725/erc725.js';
import LSP4Schema from '@erc725/erc725.js/schemas/LSP4DigitalAssetMetadata.json';

type Lsp7Divisibility =
  | { kind: 'LSP7_DIVISIBLE'; decimals: number }
  | { kind: 'LSP7_NON_DIVISIBLE'; reason: 'LSP4_NFT' | 'DECIMALS_ZERO' }
  | { kind: 'NOT_LSP7' }
  | { kind: 'UNKNOWN'; note: string };

export async function classifyLsp7({
  rpcUrl,
  asset,
  ipfsGateway
}: { rpcUrl: string; asset: `0x${string}`; ipfsGateway?: string; }): Promise<Lsp7Divisibility> {

  const client = createPublicClient({ transport: http(rpcUrl) });

  // 1) ERC165: is LSP7?
  const isLsp7 = await client.readContract({
    address: asset,
    abi: lsp7DigitalAssetAbi,
    functionName: 'supportsInterface',
    args: [INTERFACE_ID_LSP7],
  }).catch(() => false);

  if (!isLsp7) return { kind: 'NOT_LSP7' };

  // 2) LSP4TokenType via ERC725Y
  let tokenType: number | undefined;
  try {
    const erc725 = new ERC725(LSP4Schema as any, asset, rpcUrl, {
      ipfsGateway: ipfsGateway ?? 'https://cloudflare-ipfs.com/ipfs/',
    });
    const res = await erc725.fetchData('LSP4TokenType'); // numeric enum
    tokenType = Number(res?.value);
  } catch {
    // ignore; fall back to decimals()
  }

  if (tokenType === 1) {
    // LSP7 NFT (multi-unit NFT) -> non-divisible
    return { kind: 'LSP7_NON_DIVISIBLE', reason: 'LSP4_NFT' };
  }

  // 3) decimals()
  try {
    const decimals = Number(await client.readContract({
      address: asset,
      abi: lsp7DigitalAssetAbi,
      functionName: 'decimals'
    }));

    if (decimals === 0) {
      return { kind: 'LSP7_NON_DIVISIBLE', reason: 'DECIMALS_ZERO' };
    }
    if (decimals > 0) {
      return { kind: 'LSP7_DIVISIBLE', decimals };
    }
    return { kind: 'UNKNOWN', note: 'decimals returned unexpected value' };
  } catch (e) {
    return { kind: 'UNKNOWN', note: 'decimals() missing or reverted' };
  }
}

ethers v6 variant (if you prefer)

Same logic; swap viem calls for new ethers.Contract(address, abi, provider) and contract.supportsInterface(id) / contract.decimals().

notes / edge cases
	•	Primary signal: decimals(); secondary discriminator: LSP4TokenType. If TokenType=1, you can short-circuit to non-divisible without even reading decimals().  ￼ ￼
	•	LSP7’s spec explicitly blesses decimals=0 for non-divisible; most fungible tokens will use 18.  ￼
	•	Use @lukso/lsp7-contracts ABIs & constants instead of hand-rolled ABIs; avoids drift across spec versions.  ￼
	•	If you need to assert “is LSP7” without relying on ABI shape, ERC-165 with INTERFACE_ID_LSP7 is the canonical way.  ￼ ￼
	•	If you want to inspect more LSP4 fields later (name/symbol/icons/creators), stick with erc725.js + LSP4 schema; it handles the ABI-less ERC725Y reads & decoding.  ￼

sources
	•	LSP7 spec (decimals guidance) and standard purpose.  ￼
	•	LSP4 LSP4TokenType (0=Token, 1=NFT, 2=Collection) + how to read it with erc725.js.  ￼
	•	Official LUKSO packages (@lukso/lsp7-contracts, @lukso/lsp4-contracts, @lukso/lsp-smart-contracts).  ￼ ￼
	•	ERC-165 interface detection rationale.  ￼

if you want, i can wrap this into a tiny util package (@curia/lukso-asset-classifier) and add tests with a few known LSP7s (one divisible, one non-divisible).