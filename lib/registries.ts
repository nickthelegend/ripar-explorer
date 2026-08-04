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

/** AlgoNode's public TestNet endpoints. No key, and CORS is open. */
export const TESTNET_ALGOD = "https://testnet-api.algonode.cloud";
export const TESTNET_INDEXER = "https://testnet-idx.algonode.cloud";

export type RegistryKey = "identity" | "reputation" | "validation";

export const REGISTRIES: Record<
  RegistryKey,
  { appId: number; name: string; role: string }
> = {
  identity: {
    appId: 768_571_941,
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
    appId: 768_571_942,
    name: "ReputationRegistry",
    role: "What an agent has been paid for, read from the settling transfer itself.",
  },
  validation: {
    appId: 768_571_946,
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
 * The asset the ReputationRegistry counts, read from its own `usdc_asset`
 * global at bootstrap and repeated here so a page can name it without a call.
 *
 * It is NOT circulating TestNet USDC (10458941). It is `rUSDC`, six decimals,
 * minted for this deployment because the TestNet USDC faucet is behind a login
 * and an unfunded settlement asset would have meant no settlements to read at
 * all. The substitution is deliberate; every page that shows an amount says
 * `rUSDC` rather than `USDC` so the figure is never mistaken for the real
 * thing.
 */
export const SETTLEMENT_ASSET = {
  id: 768_547_363,
  unitName: "rUSDC",
  name: "Ripar Test USDC",
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
