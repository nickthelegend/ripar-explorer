/**
 * Where the three ERC-8004 registries actually live, and how to link out to
 * them.
 *
 * Constants only, with no dependencies, because both halves of the app need
 * them: `lib/erc8004.ts` reads the boxes with algosdk on the server, and the
 * chrome's data-source strip links to the same app ids from a client
 * component. Declared twice they would drift, and the strip would end up
 * quoting an app id that no longer holds the boxes the page is showing.
 */

/**
 * Where the chain is, and which apps hold the boxes.
 *
 * AlgoNode's public TestNet endpoints by default: no key, CORS open. Every
 * value is overridable by env so the explorer can be pointed at a LocalNet —
 * which is the only way to develop it against a chain you can reset, and the
 * only way to see it render a state you deliberately created.
 *
 * NEXT_PUBLIC_ so the client-side data-source strip reads the same values the
 * server does. Two sources here is how the strip ends up quoting an app id
 * that no longer holds the boxes on screen.
 */
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const TESTNET_ALGOD = process.env.NEXT_PUBLIC_ALGOD_URL ?? "https://testnet-api.algonode.cloud";
export const TESTNET_INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL ?? "https://testnet-idx.algonode.cloud";
/** Sent as X-Algo-API-Token. Empty for public nodes; LocalNet wants the all-'a' token. */
export const ALGOD_TOKEN = process.env.NEXT_PUBLIC_ALGOD_TOKEN ?? "";

/**
 * What to call the chain in front of a reader.
 *
 * Derived, not hardcoded. Every "read at TestNet round N" on these pages was a
 * literal, so pointing the explorer at a LocalNet produced a page that read one
 * chain and named another — the same shape of error as printing "USDC" over an
 * amount denominated in something else, and just as easy to carry away wrong.
 */
export const NETWORK_LABEL =
  process.env.NEXT_PUBLIC_NETWORK_LABEL ??
  (/localhost|127\.0\.0\.1/.test(TESTNET_ALGOD) ? "LocalNet" : "TestNet");

export type RegistryKey = "identity" | "reputation" | "validation";

/**
 * These moved once, and the reason matters more than the numbers.
 *
 * The first TestNet deployment (768633998/9/768634000) is still on chain and
 * still readable, but its deployer mnemonic was written to /tmp and pruned, so
 * nobody can sign for it: no agent can be registered, no job posted, no escrow
 * released. A registry you can only read is a museum piece.
 *
 * These three replace them, deployed from a key stored in ~/.ripar at 0600, and
 * they settle in circulating TestNet USDC (10458941) rather than an asset we
 * minted for ourselves.
 */
export const REGISTRIES: Record<
  RegistryKey,
  { appId: number; name: string; role: string }
> = {
  identity: {
    appId: num(process.env.NEXT_PUBLIC_IDENTITY_APP, 770_382_913),
    name: "IdentityRegistry",
    role: "Who an agent is: id, domain and controlling address.",
  },
  reputation: {
    // v2. The first deployment took the payment id and amount as ARGUMENTS and
    // checked only that the id was 32 bytes and unseen, so two of its counted
    // payments resolve to no transaction at all — one of them 32 zero bytes.
    // This one takes the transfer itself, accept_feedback(axfer, …), and reads
    // the amount and id off a transaction the AVM has already validated, so
    // every credit here is backed by money that actually moved.
    appId: num(process.env.NEXT_PUBLIC_REPUTATION_APP, 770_382_914),
    name: "ReputationRegistry",
    role: "What an agent has been paid for, read from the settling transfer itself.",
  },
  validation: {
    appId: num(process.env.NEXT_PUBLIC_VALIDATION_APP, 770_382_915),
    name: "ValidationRegistry",
    role: "The job board and the verdict on each delivered result.",
  },
};

/**
 * Box key prefixes, from the deployed contracts' `BoxMap(key_prefix=...)`.
 * A box name is the prefix followed by the raw key — a big-endian uint64 for
 * the id-keyed maps, 32 raw bytes for an address or a transaction id.
 */
export const BOX_PREFIX = {
  agents: "ag_",
  agentByDomain: "dm_",
  agentByAddress: "ad_",
  scores: "sc_",
  countedPayments: "pd_",
  jobs: "jb_",
  /**
   * ValidationRegistry escrow: `es_` + uint64 job id, value a bare uint64 of
   * base units actually held. Kept out of the `Job` struct on purpose — a
   * budget is what the client says the work is worth, escrow is what they have
   * actually handed over, and collapsing the two would let a page report an
   * unfunded job as funded. An absent box means nothing is held.
   */
  escrow: "es_",
} as const;

/**
 * The asset the ReputationRegistry counts.
 *
 * This TRACKS THE CHAIN; it is not a preference. `bootstrap` fixes `usdc_asset`
 * once and `accept_feedback` asserts it on every credit, so the deployed
 * registry is the definition and this is a transcription of it.
 *
 * That is now circulating TestNet USDC (10458941), the asset Circle issues, not
 * one we minted for ourselves. It used to be `rUSDC` (768547363) because the
 * faucet is login-gated and an unfunded settlement asset would have meant no
 * settlements to read at all — but a payment layer whose demo settles in a token
 * its own authors printed is demonstrating the plumbing, not the payment.
 *
 * `bootstrap` is one-shot, so the move required a redeploy rather than a config
 * change, and this constant moves WITH the redeploy, never ahead of it. It was
 * once set to 10458941 while the chain still asserted 768547363, which would
 * have labelled every amount on the "Real chain data" pages with a ticker that
 * was not the one being counted.
 *
 * `scripts/check-settlement-asset.mjs` reads the registry and fails the build on
 * any disagreement, so this cannot drift again in either direction.
 */
export const SETTLEMENT_ASSET = {
  id: num(process.env.NEXT_PUBLIC_SETTLEMENT_ASSET, 10_458_941),
  unitName: "USDC",
  name: "USD Coin",
  decimals: 6,
} as const;

/* ── independent verification ──────────────────────────────────────────── */

/**
 * Every id on the registry pages links here. Pera's explorer is run by someone
 * else entirely, which is the point: a number we print is worth nothing until
 * a reader can check it somewhere that is not us.
 */
export const PERA_TESTNET = "https://testnet.explorer.perawallet.app";

export const peraApp = (appId: number) => `${PERA_TESTNET}/application/${appId}/`;
export const peraAddress = (address: string) => `${PERA_TESTNET}/address/${address}/`;
export const peraTx = (txId: string) => `${PERA_TESTNET}/tx/${txId}/`;
export const peraBlock = (round: number) => `${PERA_TESTNET}/block/${round}/`;

/**
 * Lora, AlgoKit's explorer. A second opinion, run by the Algorand Foundation
 * rather than a wallet vendor, and the one that renders an app call's ABI
 * method and box references — which is what someone checking a registry write
 * actually needs to see.
 */
export const LORA_TESTNET = "https://lora.algokit.io/testnet";

export const loraTx = (txId: string) => `${LORA_TESTNET}/transaction/${txId}`;
export const loraAddress = (address: string) => `${LORA_TESTNET}/account/${address}`;
export const loraApp = (appId: number) => `${LORA_TESTNET}/application/${appId}`;
export const loraAsset = (assetId: number) => `${LORA_TESTNET}/asset/${assetId}`;
export const loraBlock = (round: number) => `${LORA_TESTNET}/block/${round}`;
