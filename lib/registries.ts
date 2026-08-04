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
    appId: 768_547_159,
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
    appId: 768_559_198,
    name: "ReputationRegistry",
    role: "What an agent has been paid for, read from the settling transfer itself.",
  },
  validation: {
    appId: 768_547_172,
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
