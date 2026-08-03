/**
 * Sample dataset + query layer for Ripar Explorer.
 *
 * Every `fetch*` function here returns the exact envelope a real indexer route
 * would return (`{ data, page, pageSize, total, totalPages, ... }`), so the day
 * the TestNet indexer lands the swap is a one-line change inside each function
 * body and nothing in the UI moves.
 *
 * Two rules this file holds itself to:
 *
 *  1. NOTHING IS RANDOM AT RENDER TIME. The dataset is built once, at module
 *     load, from a seeded PRNG against a frozen snapshot timestamp. Server and
 *     client therefore agree, and "3h ago" means 3h before the snapshot rather
 *     than drifting every time someone reloads.
 *
 *  2. THE NUMBERS RECONCILE. Agent win counts, success rates and earnings are
 *     *derived* from the job and transaction records below, never asserted
 *     alongside them. If you add up an agent's jobs on its detail page you get
 *     the number on the index. An explorer whose totals disagree with its own
 *     rows is worse than no explorer.
 */

export type Network = "testnet" | "mainnet";

export const NETWORKS: ReadonlyArray<{ id: Network; label: string; explorer: string }> = [
  { id: "testnet", label: "TestNet", explorer: "https://testnet.allo.info" },
  { id: "mainnet", label: "MainNet", explorer: "https://allo.info" },
];

export const DEFAULT_NETWORK: Network = "testnet";

/** The dataset is a frozen capture, not a live tail. Stated everywhere it matters. */
export const SNAPSHOT = "2026-07-28T14:20:00.000Z";
const NOW = Date.parse(SNAPSHOT);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Algorand block cadence, used to map a timestamp back onto a round number. */
const ROUND_MS = 2_800;

const HEAD_ROUND: Record<Network, number> = {
  mainnet: 62_140_887,
  testnet: 58_902_431,
};

/** USDC on Algorand MainNet — the one identifier here that is real and checkable. */
export const USDC_ASSET_ID = 31_566_704;

export function isNetwork(value: string | null | undefined): value is Network {
  return value === "testnet" || value === "mainnet";
}

export function networkLabel(network: Network): string {
  return NETWORKS.find((n) => n.id === network)!.label;
}

export function explorerBase(network: Network): string {
  return NETWORKS.find((n) => n.id === network)!.explorer;
}

export const txUrl = (network: Network, id: string) => `${explorerBase(network)}/tx/${id}`;
export const addressUrl = (network: Network, addr: string) => `${explorerBase(network)}/address/${addr}`;
export const blockUrl = (network: Network, round: number) => `${explorerBase(network)}/block/${round}`;

/* ── types ─────────────────────────────────────────────────────────────── */

export type AgentStatus = "online" | "degraded" | "offline" | "suspended";

export type Agent = {
  id: string;
  handle: string;
  name: string;
  summary: string;
  network: Network;
  status: AgentStatus;
  /** Why the agent is not `online`. Null when it is. */
  statusNote: string | null;
  skills: string[];
  address: string;
  operator: string;
  endpoint: string;
  version: string;
  price: { amount: number; asset: "USDC"; unit: "call" };
  registeredRound: number;
  registeredAt: string;
  lastSeenAt: string;
  /** Derived from the job ledger below — see `deriveAgentStats`. */
  stats: {
    bids: number;
    won: number;
    completed: number;
    failed: number;
    active: number;
    successRate: number | null;
    earnedUsdc: number;
    medianRuntimeMin: number | null;
    disputes: number;
  };
};

export type JobStatus =
  | "open"
  | "bidding"
  | "running"
  | "verifying"
  | "verified"
  | "failed"
  | "cancelled"
  | "expired";

export type BidState = "leading" | "accepted" | "outbid" | "withdrawn" | "rejected";

export type Bid = {
  agentId: string;
  amountUsdc: number;
  etaMin: number;
  submittedAt: string;
  state: BidState;
  note: string | null;
};

export type EscrowState = "unfunded" | "funded" | "locked" | "released" | "refunded";

export type VerificationState = "not-run" | "pending" | "passed" | "failed";

export type Job = {
  id: string;
  title: string;
  spec: string;
  /** What the requester will accept as done. Shown verbatim on the detail page. */
  acceptance: string[];
  network: Network;
  status: JobStatus;
  statusNote: string | null;
  skillsRequired: string[];
  requester: string;
  budgetUsdc: number;
  escrow: {
    state: EscrowState;
    /** Actually held by the escrow app right now. Zero once it has settled. */
    heldUsdc: number;
    /** The winning bid, which becomes the price. Null until the job is awarded. */
    agreedUsdc: number | null;
    appId: number | null;
  };
  bids: Bid[];
  winnerAgentId: string | null;
  /** Set when the winner was not the cheapest bid, so the choice is explainable. */
  awardReason: string | null;
  createdAt: string;
  bidsCloseAt: string;
  startedAt: string | null;
  endedAt: string | null;
  createdRound: number;
  verification: {
    method: "attestation" | "quorum" | "oracle";
    state: VerificationState;
    attestors: number;
    score: number | null;
    note: string | null;
  };
};

export type TxKind = "escrow-fund" | "escrow-release" | "escrow-refund";

export type Transaction = {
  id: string;
  network: Network;
  round: number;
  timestamp: string;
  kind: TxKind;
  status: "confirmed" | "failed";
  /** Present only when the transaction failed; the on-chain rejection reason. */
  failureReason: string | null;
  jobId: string | null;
  agentId: string | null;
  from: string;
  to: string;
  /** What the recipient actually receives, already net of `protocolFeeUsdc`. */
  amountUsdc: number;
  /** Protocol's cut, withheld inside this same transaction. Zero elsewhere. */
  protocolFeeUsdc: number;
  feeMicroAlgo: number;
  /** x402 payload lifted out of the transaction note field, when there is one. */
  x402: { scheme: "exact"; resource: string; requestId: string } | null;
};

/* ── deterministic primitives ──────────────────────────────────────────── */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function b32(rnd: () => number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += B32[Math.floor(rnd() * 32)];
  return out;
}

const iso = (ms: number) => new Date(ms).toISOString();
const roundAt = (network: Network, ms: number) =>
  HEAD_ROUND[network] - Math.floor((NOW - ms) / ROUND_MS);
const between = (rnd: () => number, lo: number, hi: number) => lo + rnd() * (hi - lo);
const money = (n: number) => Math.round(n * 100) / 100;

/* ── agent roster ──────────────────────────────────────────────────────── */

type AgentSeed = {
  name: string;
  handle: string;
  summary: string;
  skills: string[];
  network: Network;
  status?: AgentStatus;
  statusNote?: string;
  /** Hours since the agent last answered a health probe. */
  lastSeenH?: number;
  registeredDaysAgo: number;
  price: number;
};

const AGENT_SEEDS: AgentSeed[] = [
  { name: "Vault Sentry", handle: "vault-sentry", summary: "Scores lending-vault positions for liquidation risk and returns a signed risk band per position.", skills: ["risk-scoring", "defi", "monitoring"], network: "testnet", registeredDaysAgo: 118, price: 0.04 },
  { name: "Ledger Cartographer", handle: "ledger-cartographer", summary: "Walks Algorand account graphs and returns labelled counterparty clusters with confidence weights.", skills: ["indexing", "graph-analysis", "algorand"], network: "testnet", registeredDaysAgo: 112, price: 0.09 },
  { name: "Fee Oracle", handle: "fee-oracle", summary: "Forecasts congestion-adjusted transaction cost for the next 200 rounds.", skills: ["forecasting", "timeseries", "algorand"], network: "mainnet", registeredDaysAgo: 104, price: 0.01 },
  { name: "Clause Reader", handle: "clause-reader", summary: "Extracts obligations, dates and counterparties from contract PDFs into a typed schema.", skills: ["document-parsing", "nlp", "compliance"], network: "testnet", registeredDaysAgo: 97, price: 0.22 },
  { name: "Bridge Watch", handle: "bridge-watch", summary: "Watches bridge contracts across four chains and raises an alert on reserve divergence.", skills: ["monitoring", "cross-chain", "alerting"], network: "mainnet", status: "degraded", statusNote: "Two of four upstream RPC endpoints timing out; results may be partial.", lastSeenH: 0.4, registeredDaysAgo: 91, price: 0.06 },
  { name: "Glyph Transcriber", handle: "glyph-transcriber", summary: "OCR for scanned and handwritten documents, returns text plus per-token confidence.", skills: ["ocr", "document-parsing", "vision"], network: "testnet", registeredDaysAgo: 88, price: 0.15 },
  { name: "Basis Trader", handle: "basis-trader", summary: "Prices perp-spot basis across venues and returns an executable spread with slippage bounds.", skills: ["defi", "execution", "market-data"], network: "mainnet", registeredDaysAgo: 84, price: 0.31 },
  { name: "Merkle Auditor", handle: "merkle-auditor", summary: "Verifies inclusion proofs and re-derives roots from raw leaf sets.", skills: ["verification", "cryptography", "proofs"], network: "testnet", registeredDaysAgo: 79, price: 0.03 },
  { name: "Freight Router", handle: "freight-router", summary: "Solves multi-stop routing under time windows and returns a costed manifest.", skills: ["optimisation", "logistics", "geospatial"], network: "testnet", registeredDaysAgo: 74, price: 0.18 },
  { name: "Sentiment Mill", handle: "sentiment-mill", summary: "Aggregates public posts into a per-asset sentiment index with source attribution.", skills: ["nlp", "social", "scoring"], network: "mainnet", registeredDaysAgo: 70, price: 0.05 },
  { name: "Schema Smith", handle: "schema-smith", summary: "Infers a normalised schema from messy tabular input and emits migrations.", skills: ["codegen", "data-modelling"], network: "testnet", registeredDaysAgo: 66, price: 0.12 },
  { name: "Patch Warden", handle: "patch-warden", summary: "Reviews diffs for injection, auth and dependency risk; returns findings with line anchors.", skills: ["code-review", "security", "static-analysis"], network: "testnet", registeredDaysAgo: 61, price: 0.27 },
  { name: "Rate Scribe", handle: "rate-scribe", summary: "Normalises lending rates across protocols into a single comparable APY surface.", skills: ["market-data", "pricing", "aggregation"], network: "mainnet", registeredDaysAgo: 57, price: 0.02 },
  { name: "Atlas Geocoder", handle: "atlas-geocoder", summary: "Resolves free-text addresses to coordinates with an explicit ambiguity list.", skills: ["geospatial", "enrichment"], network: "testnet", registeredDaysAgo: 52, price: 0.008 },
  { name: "Quorum Notary", handle: "quorum-notary", summary: "Independent verifier: re-runs a job's acceptance checks and signs an attestation.", skills: ["attestation", "verification", "consensus"], network: "testnet", registeredDaysAgo: 48, price: 0.07 },
  { name: "Cold Path", handle: "cold-path", summary: "Retrieves and reassembles archived block data older than the indexer's retention window.", skills: ["archival", "retrieval", "indexing"], network: "mainnet", registeredDaysAgo: 44, price: 0.11 },
  { name: "Signal Sifter", handle: "signal-sifter", summary: "Flags anomalies in metric streams and returns the contributing dimensions.", skills: ["anomaly-detection", "timeseries", "monitoring"], network: "testnet", registeredDaysAgo: 39, price: 0.06 },
  { name: "Copy Forge", handle: "copy-forge", summary: "Drafts and variant-tests short marketing copy against a supplied brand sheet.", skills: ["nlp", "generation"], network: "testnet", registeredDaysAgo: 34, price: 0.09 },
  { name: "Depth Prober", handle: "depth-prober", summary: "Snapshots order-book depth and reports realised slippage for a target size.", skills: ["market-data", "orderbook", "defi"], network: "mainnet", registeredDaysAgo: 29, price: 0.14 },
  { name: "Lien Checker", handle: "lien-checker", summary: "Cross-references public registries for encumbrances against an asset identifier.", skills: ["compliance", "records", "verification"], network: "testnet", registeredDaysAgo: 24, price: 0.33 },
  { name: "Tessellate", handle: "tessellate", summary: "Segments aerial imagery into parcels and returns polygons with area estimates.", skills: ["vision", "segmentation", "geospatial"], network: "testnet", registeredDaysAgo: 19, price: 0.21 },
  { name: "Null Route", handle: "null-route", summary: "Probes endpoint reachability from six regions and reports per-region latency.", skills: ["monitoring", "networking"], network: "testnet", status: "offline", statusNote: "No response to health probes for over a week. The registration is intact and its history stands; the endpoint is simply not answering, so it cannot be awarded new work.", lastSeenH: 218, registeredDaysAgo: 15, price: 0.02 },
  { name: "Halcyon Redact", handle: "halcyon-redact", summary: "Removes personal data from documents and returns a redaction map for audit.", skills: ["privacy", "redaction", "document-parsing"], network: "mainnet", registeredDaysAgo: 9, price: 0.17 },
  { name: "Prime Broker", handle: "prime-broker", summary: "Routes execution across venues under a per-job risk envelope.", skills: ["defi", "execution", "risk-scoring"], network: "testnet", status: "suspended", statusNote: "Suspended by the registry while a requester dispute is open. A suspended agent cannot bid, and any bid it had outstanding was withdrawn.", lastSeenH: 61, registeredDaysAgo: 6, price: 0.29 },
];

/* ── job ledger ────────────────────────────────────────────────────────── */

type JobSeed = {
  title: string;
  spec: string;
  acceptance: string[];
  skills: string[];
  network: Network;
  status: JobStatus;
  statusNote?: string;
  budget: number;
  createdHoursAgo: number;
  /** Bidding window length in hours, from creation. */
  windowH: number;
  bidCount: number;
  /** Index into the ranked bid list that actually won. 0 = cheapest. */
  winnerRank?: number;
  /** Handle of an agent this job's story depends on, forced into the bid list
   *  and awarded the work regardless of price. */
  pin?: string;
  awardReason?: string;
  verification?: { method: Job["verification"]["method"]; state: VerificationState; attestors: number; score?: number; note?: string };
};

const JOB_SEEDS: JobSeed[] = [
  // ── verified ────────────────────────────────────────────────────────────
  { title: "Re-derive Merkle roots for the Q2 airdrop leaf set", spec: "Take the 412k-leaf CSV at the supplied URL, rebuild the tree, and confirm the published root matches. Return every leaf whose proof fails.", acceptance: ["Root hash matches the published value byte for byte", "Any failing leaf is returned with its index and computed proof"], skills: ["verification", "cryptography", "proofs"], network: "testnet", status: "verified", budget: 40, createdHoursAgo: 246, windowH: 12, bidCount: 4, verification: { method: "attestation", state: "passed", attestors: 1, score: 100, note: "Root matched on independent re-run." } },
  { title: "Label counterparty clusters for 9 flagged accounts", spec: "Walk two hops out from each address, cluster by shared funding sources, and label clusters against the public tag set.", acceptance: ["Every cluster carries a confidence weight", "Unlabelled clusters are returned rather than dropped"], skills: ["graph-analysis", "indexing", "algorand"], network: "testnet", status: "verified", budget: 120, createdHoursAgo: 231, windowH: 18, bidCount: 5, winnerRank: 1, awardReason: "The requester's award note cites prior work by this agent on the same account set. Cheaper bids were declined without further comment.", verification: { method: "quorum", state: "passed", attestors: 3, score: 96, note: "Three verifiers agreed on 8 of 9 clusters; the ninth was returned unlabelled as specified." } },
  { title: "Extract payment obligations from 60 supplier contracts", spec: "Parse the supplied PDF bundle into a typed schema of obligation, amount, currency, due date, counterparty.", acceptance: ["Every obligation has a due date or an explicit null", "Amounts carry an ISO currency code"], skills: ["document-parsing", "nlp", "compliance"], network: "testnet", status: "verified", budget: 260, createdHoursAgo: 214, windowH: 24, bidCount: 3, verification: { method: "attestation", state: "passed", attestors: 1, score: 98, note: "Spot-check of 12 random contracts by the requester passed." } },
  { title: "Forecast congestion-adjusted fee for the next 200 rounds", spec: "Return a per-round fee estimate with an 80% interval, refreshed once.", acceptance: ["Estimate covers all 200 rounds", "Interval is reported, not just the point estimate"], skills: ["forecasting", "timeseries", "algorand"], network: "mainnet", status: "verified", budget: 8, createdHoursAgo: 198, windowH: 6, bidCount: 2, verification: { method: "oracle", state: "passed", attestors: 1, score: 91, note: "Realised fees fell inside the stated interval for 184 of 200 rounds." } },
  { title: "Segment 1,100 aerial tiles into parcel polygons", spec: "Return one polygon per parcel with an area estimate in square metres and a tile reference.", acceptance: ["Polygons are closed and non-self-intersecting", "Area estimates carry a stated tolerance"], skills: ["vision", "segmentation", "geospatial"], network: "testnet", status: "verified", budget: 190, createdHoursAgo: 176, windowH: 20, bidCount: 3, verification: { method: "quorum", state: "passed", attestors: 2, score: 94, note: "Both verifiers reproduced the polygon set within the stated tolerance." } },
  { title: "Normalise lending APYs across seven protocols", spec: "Return a single comparable APY surface with the compounding assumption stated per source.", acceptance: ["Compounding basis is explicit for every source", "Sources that could not be read are listed"], skills: ["market-data", "pricing", "aggregation"], network: "mainnet", status: "verified", budget: 26, createdHoursAgo: 154, windowH: 10, bidCount: 4, verification: { method: "attestation", state: "passed", attestors: 1, score: 99, note: "Recomputed from raw protocol reads and matched." } },
  { title: "Review the settlement-path diff for injection risk", spec: "Review the supplied 2,400-line diff. Return findings anchored to file and line with severity.", acceptance: ["Every finding names a file and line", "Severity uses the supplied four-level scale"], skills: ["code-review", "security", "static-analysis"], network: "testnet", status: "verified", budget: 300, createdHoursAgo: 139, windowH: 16, bidCount: 2, verification: { method: "attestation", state: "passed", attestors: 1, score: 97, note: "Two of eleven findings were downgraded on review; the rest stood." } },
  { title: "Retrieve archived block bodies for rounds 41.2M–41.4M", spec: "Reassemble block bodies outside the indexer retention window and return them as newline-delimited JSON.", acceptance: ["Every requested round is present or explicitly reported missing", "Block hashes verify against the header chain"], skills: ["archival", "retrieval", "indexing"], network: "mainnet", status: "verified", budget: 145, createdHoursAgo: 121, windowH: 14, bidCount: 3, verification: { method: "oracle", state: "passed", attestors: 1, score: 100, note: "All 200,000 block hashes verified against headers." } },
  { title: "Score 340 vault positions for liquidation risk", spec: "Return a risk band per position with the health factor and the price move that would trigger liquidation.", acceptance: ["Every position has a band and a trigger price", "Method is stated once, not per position"], skills: ["risk-scoring", "defi", "monitoring"], network: "testnet", status: "verified", budget: 55, createdHoursAgo: 96, windowH: 8, bidCount: 6, verification: { method: "quorum", state: "passed", attestors: 3, score: 93, note: "Verifiers disagreed on 4 borderline positions; all four were inside the stated tolerance." } },

  // ── failed ──────────────────────────────────────────────────────────────
  { title: "Probe endpoint reachability from six regions", spec: "Return per-region latency percentiles over a 30-minute window.", acceptance: ["All six regions reported", "p50, p95 and p99 for each"], skills: ["monitoring", "networking"], network: "testnet", status: "failed", statusNote: "The awarded agent stopped answering 41 minutes into the run and the deadline passed with no result. Escrow was refunded in full and the agent has been offline ever since.", budget: 18, createdHoursAgo: 212, windowH: 6, bidCount: 2, pin: "null-route", awardReason: "Only one bidder holds the networking skill this job asks for, so the award was never really a contest.", verification: { method: "attestation", state: "not-run", attestors: 0, note: "No result was submitted, so verification never ran." } },
  { title: "Cross-reference liens against 80 asset identifiers", spec: "Check each identifier against the three public registries listed and return any encumbrance found.", acceptance: ["All three registries checked per identifier", "Registry response timestamps included"], skills: ["compliance", "records", "verification"], network: "testnet", status: "failed", statusNote: "Result was submitted on time but failed quorum verification: two of three verifiers could not reproduce the registry responses.", budget: 210, createdHoursAgo: 168, windowH: 18, bidCount: 3, verification: { method: "quorum", state: "failed", attestors: 3, score: 34, note: "Verifiers 1 and 3 found no matching registry record for 22 of 80 identifiers. Escrow refunded to the requester." } },
  { title: "Price the perp-spot basis for four majors", spec: "Return an executable spread per asset with slippage bounds at a $250k clip.", acceptance: ["Spread and bounds per asset", "Venue quoted per leg"], skills: ["defi", "execution", "market-data"], network: "mainnet", status: "failed", statusNote: "Requester rejected the result inside the review window: two of four assets were quoted at a clip size the spec did not ask for.", budget: 95, createdHoursAgo: 143, windowH: 8, bidCount: 3, verification: { method: "attestation", state: "failed", attestors: 1, score: 48, note: "Acceptance criterion 1 not met for BTC and ETH legs." } },

  // ── running ─────────────────────────────────────────────────────────────
  { title: "Transcribe 2,300 scanned delivery notes", spec: "OCR the supplied bundle and return text with per-token confidence and a page reference.", acceptance: ["Confidence value per token", "Pages that failed OCR are listed, not skipped"], skills: ["ocr", "document-parsing", "vision"], network: "testnet", status: "running", budget: 175, createdHoursAgo: 34, windowH: 10, bidCount: 4, verification: { method: "attestation", state: "pending", attestors: 1 } },
  { title: "Solve a 46-stop route under delivery windows", spec: "Return a costed manifest respecting all time windows, or the smallest set of windows that must be relaxed.", acceptance: ["Manifest respects every window or names the ones it cannot", "Cost is broken down per leg"], skills: ["optimisation", "logistics", "geospatial"], network: "testnet", status: "running", budget: 88, createdHoursAgo: 27, windowH: 8, bidCount: 3, verification: { method: "attestation", state: "pending", attestors: 1 } },
  { title: "Snapshot order-book depth for a $2M clip", spec: "Report realised slippage against depth at one-minute granularity across a two-hour window.", acceptance: ["Slippage reported per minute", "Depth snapshot retained for audit"], skills: ["market-data", "orderbook", "defi"], network: "mainnet", status: "running", budget: 64, createdHoursAgo: 19, windowH: 6, bidCount: 5, winnerRank: 2, awardReason: "The award note cites the depth-snapshot format this agent commits to returning; the cheaper bids did not commit to it.", verification: { method: "oracle", state: "pending", attestors: 1 } },
  { title: "Redact personal data from a 900-page disclosure bundle", spec: "Remove personal data and return a redaction map keyed by page and span for audit.", acceptance: ["Redaction map covers every removal", "Original page count preserved"], skills: ["privacy", "redaction", "document-parsing"], network: "mainnet", status: "running", budget: 240, createdHoursAgo: 13, windowH: 12, bidCount: 2, verification: { method: "quorum", state: "pending", attestors: 3 } },
  { title: "Flag anomalies in 40 days of settlement metrics", spec: "Return flagged windows with the contributing dimensions ranked by attribution.", acceptance: ["Contributing dimensions ranked, not just listed", "False-positive rate stated on a held-out slice"], skills: ["anomaly-detection", "timeseries", "monitoring"], network: "testnet", status: "running", budget: 72, createdHoursAgo: 7, windowH: 6, bidCount: 4, verification: { method: "attestation", state: "pending", attestors: 1 } },

  // ── verifying ───────────────────────────────────────────────────────────
  { title: "Sign an independent attestation for job job_4t7xb", spec: "Re-run the acceptance checks for the referenced job and sign the outcome.", acceptance: ["Attestation signed by the verifier key on file", "Every acceptance criterion answered individually"], skills: ["attestation", "verification", "consensus"], network: "testnet", status: "verifying", budget: 22, createdHoursAgo: 11, windowH: 4, bidCount: 2, verification: { method: "quorum", state: "pending", attestors: 3, note: "Two of three attestations received; waiting on the third." } },
  { title: "Infer a normalised schema from 14 vendor exports", spec: "Return a single schema plus per-vendor migrations, with every lossy mapping named.", acceptance: ["Lossy mappings named explicitly", "Migrations run clean against the sample rows"], skills: ["codegen", "data-modelling"], network: "testnet", status: "verifying", budget: 130, createdHoursAgo: 9, windowH: 8, bidCount: 3, verification: { method: "attestation", state: "pending", attestors: 1, note: "Result submitted 40 minutes ago; the review window closes in 3 hours." } },

  // ── bidding ─────────────────────────────────────────────────────────────
  { title: "Aggregate sentiment for 12 assets over 30 days", spec: "Return a daily index per asset with every contributing source attributed.", acceptance: ["Source attribution per data point", "Index method stated once"], skills: ["nlp", "social", "scoring"], network: "mainnet", status: "bidding", budget: 45, createdHoursAgo: 5, windowH: 12, bidCount: 4 },
  { title: "Resolve 18,000 free-text addresses to coordinates", spec: "Geocode the supplied list, returning an ambiguity list rather than guessing.", acceptance: ["Ambiguous inputs returned unresolved with candidates", "Coordinate precision stated"], skills: ["geospatial", "enrichment"], network: "testnet", status: "bidding", budget: 30, createdHoursAgo: 4, windowH: 10, bidCount: 6 },
  { title: "Draft and variant-test 20 ad headlines", spec: "Work from the supplied brand sheet. Return four variants per headline with the rationale for each.", acceptance: ["Four variants per headline", "Brand-sheet constraints not violated"], skills: ["nlp", "generation"], network: "testnet", status: "bidding", budget: 35, createdHoursAgo: 3, windowH: 8, bidCount: 3 },
  { title: "Watch four bridge contracts for reserve divergence", spec: "Alert on any divergence above 0.5% sustained for more than 3 minutes, for 14 days.", acceptance: ["Alert latency under 60 seconds", "Every alert carries the reserve figures that triggered it"], skills: ["monitoring", "cross-chain", "alerting"], network: "mainnet", status: "bidding", budget: 110, createdHoursAgo: 2, windowH: 24, bidCount: 2 },
  { title: "Verify inclusion proofs for 6,000 receipt leaves", spec: "Confirm each proof against the published root and return failures with the computed path.", acceptance: ["Every failure returned with its computed path", "No proof silently skipped"], skills: ["verification", "cryptography", "proofs"], network: "testnet", status: "bidding", budget: 28, createdHoursAgo: 1.5, windowH: 6, bidCount: 5 },

  // ── open ────────────────────────────────────────────────────────────────
  { title: "Build a counterparty graph for 40 exchange deposit addresses", spec: "Two-hop walk, cluster by funding source, label against the public tag set.", acceptance: ["Confidence weight per cluster", "Unlabelled clusters returned"], skills: ["graph-analysis", "indexing", "algorand"], network: "testnet", status: "open", budget: 150, createdHoursAgo: 2.2, windowH: 18, bidCount: 2 },
  { title: "Rebuild the fee surface from raw block data", spec: "Recompute per-round fees from raw blocks rather than the indexer aggregate, for a 10-day window.", acceptance: ["Computed from raw blocks, not the aggregate endpoint", "Discrepancies against the aggregate listed"], skills: ["algorand", "indexing", "timeseries"], network: "mainnet", status: "open", budget: 60, createdHoursAgo: 1.1, windowH: 12, bidCount: 1 },
  { title: "Reconcile 3,000 invoice lines against bank settlements", spec: "Match invoice lines to settlements and return unmatched items on both sides with the closest candidate.", acceptance: ["Unmatched items returned from both sides", "Closest candidate given for each"], skills: ["document-parsing", "compliance", "records"], network: "testnet", status: "open", statusNote: "No bids yet. The bidding window closes in 9 hours; the escrow is funded and will refund automatically if it closes empty.", budget: 180, createdHoursAgo: 0.7, windowH: 10, bidCount: 0 },
  { title: "Estimate slippage for a $500k rotation across three venues", spec: "Return a per-venue slippage estimate at the target clip with the depth snapshot used.", acceptance: ["Depth snapshot returned alongside the estimate", "Venue fees included in the figure"], skills: ["market-data", "orderbook", "defi"], network: "mainnet", status: "open", statusNote: "Escrow is not funded yet, so this job is visible but cannot be bid on.", budget: 50, createdHoursAgo: 0.4, windowH: 8, bidCount: 0 },

  // ── cancelled / expired ─────────────────────────────────────────────────
  { title: "Classify 12,000 support tickets into a new taxonomy", spec: "Assign each ticket to one of 22 categories with a confidence value.", acceptance: ["Confidence per ticket", "Tickets below the threshold returned unclassified"], skills: ["nlp", "scoring"], network: "testnet", status: "cancelled", statusNote: "Cancelled by the requester 3 hours into the bidding window, before any bid was accepted. Escrow refunded in full.", budget: 90, createdHoursAgo: 108, windowH: 14, bidCount: 3 },
  { title: "Reproduce the Q1 reserve attestation from raw custodian files", spec: "Recompute the attested reserve figure from the raw files and report any difference.", acceptance: ["Figure recomputed from raw files", "Any difference reported with its source"], skills: ["verification", "records", "compliance"], network: "mainnet", status: "expired", statusNote: "The bidding window closed with no bids. Escrow refunded automatically at round close.", budget: 320, createdHoursAgo: 189, windowH: 24, bidCount: 0 },
];

/* ── build ─────────────────────────────────────────────────────────────── */

const AGENTS: Agent[] = AGENT_SEEDS.map((seed, i) => {
  const rnd = mulberry32(0x1a0 + i * 977);
  const registeredAt = NOW - seed.registeredDaysAgo * DAY - Math.floor(between(rnd, 0, 20)) * HOUR;
  const lastSeenAt = NOW - (seed.lastSeenH ?? between(rnd, 0.01, 0.6)) * HOUR;
  return {
    id: `agt_${b32(rnd, 6).toLowerCase()}`,
    handle: seed.handle,
    name: seed.name,
    summary: seed.summary,
    network: seed.network,
    status: seed.status ?? "online",
    statusNote: seed.statusNote ?? null,
    skills: seed.skills,
    address: b32(rnd, 58),
    operator: b32(rnd, 58),
    endpoint: `https://${seed.handle}.agents.ripar.io`,
    version: `${1 + Math.floor(rnd() * 3)}.${Math.floor(rnd() * 12)}.${Math.floor(rnd() * 9)}`,
    price: { amount: seed.price, asset: "USDC", unit: "call" },
    registeredRound: roundAt(seed.network, registeredAt),
    registeredAt: iso(registeredAt),
    lastSeenAt: iso(lastSeenAt),
    // Placeholder — every field is overwritten by deriveAgentStats once jobs exist.
    stats: { bids: 0, won: 0, completed: 0, failed: 0, active: 0, successRate: null, earnedUsdc: 0, medianRuntimeMin: null, disputes: 0 },
  };
});

const AGENTS_BY_ID = new Map(AGENTS.map((a) => [a.id, a]));

const JOBS: Job[] = JOB_SEEDS.map((seed, i) => {
  const rnd = mulberry32(0x5c0 + i * 613);
  const createdAt = NOW - seed.createdHoursAgo * HOUR;
  const bidsCloseAt = createdAt + seed.windowH * HOUR;
  const live = seed.status === "open" || seed.status === "bidding";

  /**
   * Three rules, all of which a reader can check against the pages themselves:
   * an agent cannot bid before it existed; suspension blocks bidding outright;
   * and going offline does not erase history — an agent that stopped answering
   * last week still appears on jobs that closed before it went dark, it just
   * cannot be sitting on a live board now.
   */
  const eligible = (a: Agent) =>
    Date.parse(a.registeredAt) < createdAt && a.status !== "suspended" && !(a.status === "offline" && live);

  // Bidders are drawn from agents on the same network that share a skill with
  // the job. Skill overlap first, then anyone eligible, so a niche job still
  // attracts the small pool that could actually do it.
  const sameNet = AGENTS.filter((a) => a.network === seed.network);
  const matching = sameNet.filter((a) => a.skills.some((s) => seed.skills.includes(s)));
  const fallback = sameNet.filter((a) => !matching.includes(a));
  const pool = [...matching, ...fallback].filter(eligible);

  const pinned = seed.pin ? AGENTS.find((a) => a.handle === seed.pin) : undefined;
  const chosen: Agent[] = pinned ? [pinned] : [];
  for (let k = chosen.length; k < seed.bidCount && chosen.length < pool.length; k++) {
    // Weighted toward the head of the pool, which is the skill-matched slice.
    const span = Math.max(1, Math.ceil(pool.length * (k === 0 ? 0.45 : 1)));
    let idx = Math.floor(rnd() * span);
    while (chosen.includes(pool[idx])) idx = (idx + 1) % pool.length;
    chosen.push(pool[idx]);
  }

  const bids: Bid[] = chosen
    .map((agent) => ({
      agentId: agent.id,
      amountUsdc: money(seed.budget * between(rnd, 0.42, 0.97)),
      etaMin: Math.round(between(rnd, 25, 900) / 5) * 5,
      submittedAt: iso(createdAt + between(rnd, 0.05, 0.85) * seed.windowH * HOUR),
      state: "outbid" as BidState,
      note: null as string | null,
    }))
    .sort((a, b) => a.amountUsdc - b.amountUsdc);

  const awardable = !live && seed.status !== "cancelled" && seed.status !== "expired";
  const awarded = !awardable
    ? null
    : pinned
      ? bids.find((b) => b.agentId === pinned.id) ?? null
      : bids[seed.winnerRank ?? 0] ?? null;

  for (const bid of bids) {
    if (awarded && bid === awarded) bid.state = "accepted";
    else if (live) bid.state = bid === bids[0] ? "leading" : "outbid";
    else if (seed.status === "cancelled" || seed.status === "expired") bid.state = "withdrawn";
    else bid.state = "outbid";
  }
  // One withdrawn bid on a live board — bids are not permanent and the UI must
  // be able to say so.
  if (seed.status === "bidding" && bids.length > 3) {
    bids[bids.length - 1].state = "withdrawn";
    bids[bids.length - 1].note = "Withdrawn by the agent before the window closed.";
  }
  // Anything cheaper than the awarded bid was actively passed over, which is a
  // different fact from being outbid and should not read the same.
  if (awarded) {
    for (const bid of bids) {
      if (bid.amountUsdc < awarded.amountUsdc) bid.state = "rejected";
    }
  }

  const running = seed.status === "running" || seed.status === "verifying";
  const settled = seed.status === "verified" || seed.status === "failed";
  const startedAt = awarded ? createdAt + seed.windowH * HOUR + between(rnd, 2, 40) * MIN : null;
  const endedAt =
    settled && startedAt != null
      ? startedAt + between(rnd, 0.4, 6) * HOUR
      : seed.status === "cancelled"
        ? createdAt + 3 * HOUR
        : seed.status === "expired"
          ? bidsCloseAt
          : null;

  const escrowState: EscrowState =
    seed.status === "verified"
      ? "released"
      : seed.status === "failed" || seed.status === "cancelled" || seed.status === "expired"
        ? "refunded"
        : running
          ? "locked"
          : seed.statusNote?.startsWith("Escrow is not funded")
            ? "unfunded"
            : "funded";

  const v = seed.verification;

  return {
    id: `job_${b32(rnd, 5).toLowerCase()}`,
    title: seed.title,
    spec: seed.spec,
    acceptance: seed.acceptance,
    network: seed.network,
    status: seed.status,
    statusNote: seed.statusNote ?? null,
    skillsRequired: seed.skills,
    requester: b32(rnd, 58),
    budgetUsdc: seed.budget,
    escrow: {
      state: escrowState,
      // The whole budget stays locked until the job settles; the winning bid
      // only decides how that budget is split at settlement.
      heldUsdc: escrowState === "funded" || escrowState === "locked" ? seed.budget : 0,
      agreedUsdc: awarded?.amountUsdc ?? null,
      appId: escrowState === "unfunded" ? null : 1_140_000 + i * 17,
    },
    bids,
    winnerAgentId: awarded?.agentId ?? null,
    awardReason: seed.awardReason ?? null,
    createdAt: iso(createdAt),
    bidsCloseAt: iso(bidsCloseAt),
    startedAt: startedAt != null ? iso(startedAt) : null,
    endedAt: endedAt != null ? iso(endedAt) : null,
    createdRound: roundAt(seed.network, createdAt),
    verification: {
      method: v?.method ?? "attestation",
      state: v?.state ?? "not-run",
      attestors: v?.attestors ?? 0,
      score: v?.score ?? null,
      note: v?.note ?? null,
    },
  } satisfies Job;
});

const JOBS_BY_ID = new Map(JOBS.map((j) => [j.id, j]));

/* ── transactions, derived from the job ledger ─────────────────────────── */

const TRANSACTIONS: Transaction[] = (() => {
  const out: Transaction[] = [];
  const rnd = mulberry32(0x9e11);

  const push = (t: Omit<Transaction, "id" | "round"> & { round?: number }) => {
    out.push({
      ...t,
      id: b32(rnd, 52),
      round: t.round ?? roundAt(t.network, Date.parse(t.timestamp)),
    });
  };

  for (const job of JOBS) {
    const winner = job.winnerAgentId ? AGENTS_BY_ID.get(job.winnerAgentId) : undefined;
    const created = Date.parse(job.createdAt);

    if (job.escrow.state !== "unfunded") {
      push({
        network: job.network,
        timestamp: iso(created + between(rnd, 1, 9) * MIN),
        kind: "escrow-fund",
        status: "confirmed",
        failureReason: null,
        jobId: job.id,
        agentId: null,
        from: job.requester,
        to: `APP-${job.escrow.appId}`,
        amountUsdc: job.budgetUsdc,
        protocolFeeUsdc: 0,
        feeMicroAlgo: 1000,
        x402: null,
      });
    }

    // Settlement splits the escrowed budget three ways in one group: the agent
    // is paid its agreed bid less the protocol fee, and whatever the requester
    // budgeted but did not spend goes straight back.
    if (job.escrow.state === "released" && winner && job.endedAt && job.escrow.agreedUsdc != null) {
      const ended = Date.parse(job.endedAt);
      const fee = money(job.escrow.agreedUsdc * 0.015);
      push({
        network: job.network,
        timestamp: iso(ended + 2 * MIN),
        kind: "escrow-release",
        status: "confirmed",
        failureReason: null,
        jobId: job.id,
        agentId: winner.id,
        from: `APP-${job.escrow.appId}`,
        to: winner.address,
        amountUsdc: money(job.escrow.agreedUsdc - fee),
        protocolFeeUsdc: fee,
        feeMicroAlgo: 2000,
        x402: { scheme: "exact", resource: `${winner.endpoint}/v1/run`, requestId: b32(rnd, 16).toLowerCase() },
      });

      const unspent = money(job.budgetUsdc - job.escrow.agreedUsdc);
      if (unspent >= 0.01) {
        push({
          network: job.network,
          timestamp: iso(ended + 2 * MIN + 3_000),
          kind: "escrow-refund",
          status: "confirmed",
          failureReason: null,
          jobId: job.id,
          agentId: null,
          from: `APP-${job.escrow.appId}`,
          to: job.requester,
          amountUsdc: unspent,
          protocolFeeUsdc: 0,
          feeMicroAlgo: 1000,
          x402: null,
        });
      }
    }

    if (job.escrow.state === "refunded") {
      push({
        network: job.network,
        timestamp: iso(Date.parse(job.endedAt ?? job.bidsCloseAt) + between(rnd, 1, 12) * MIN),
        kind: "escrow-refund",
        status: "confirmed",
        failureReason: null,
        jobId: job.id,
        agentId: job.winnerAgentId,
        from: `APP-${job.escrow.appId}`,
        to: job.requester,
        amountUsdc: job.budgetUsdc,
        protocolFeeUsdc: 0,
        feeMicroAlgo: 2000,
        x402: null,
      });
    }
  }

  // Two rejected transactions. An explorer that only ever shows successes is
  // hiding the half of the ledger operators actually need to see.
  const underfunded = JOBS.find((j) => j.escrow.state === "unfunded");
  if (underfunded) {
    push({
      network: underfunded.network,
      timestamp: iso(Date.parse(underfunded.createdAt) + 4 * MIN),
      kind: "escrow-fund",
      status: "failed",
      failureReason: "logic eval error: assert failed — requester USDC balance below the declared budget",
      jobId: underfunded.id,
      agentId: null,
      from: underfunded.requester,
      to: "APP-1140493",
      amountUsdc: underfunded.budgetUsdc,
      protocolFeeUsdc: 0,
      feeMicroAlgo: 1000,
      x402: null,
    });
  }
  const stalled = JOBS.find((j) => j.status === "failed" && j.statusNote?.includes("stopped answering"));
  if (stalled && stalled.winnerAgentId) {
    const agent = AGENTS_BY_ID.get(stalled.winnerAgentId)!;
    push({
      network: stalled.network,
      timestamp: iso(Date.parse(stalled.startedAt ?? stalled.createdAt) + 41 * MIN),
      kind: "escrow-release",
      status: "failed",
      failureReason: "logic eval error: assert failed — no result committed before the deadline round",
      jobId: stalled.id,
      agentId: agent.id,
      from: `APP-${stalled.escrow.appId}`,
      to: agent.address,
      amountUsdc: stalled.escrow.agreedUsdc ?? stalled.budgetUsdc,
      protocolFeeUsdc: 0,
      feeMicroAlgo: 2000,
      x402: { scheme: "exact", resource: `${agent.endpoint}/v1/run`, requestId: b32(rnd, 16).toLowerCase() },
    });
  }

  return out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
})();

/* ── derived agent statistics ──────────────────────────────────────────── */

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

for (const agent of AGENTS) {
  const bidOn = JOBS.filter((j) => j.bids.some((b) => b.agentId === agent.id));
  const won = JOBS.filter((j) => j.winnerAgentId === agent.id);
  const completed = won.filter((j) => j.status === "verified");
  const failed = won.filter((j) => j.status === "failed");
  const active = won.filter((j) => j.status === "running" || j.status === "verifying");

  const earned = TRANSACTIONS.filter(
    (t) => t.agentId === agent.id && t.kind === "escrow-release" && t.status === "confirmed",
  ).reduce((sum, t) => sum + t.amountUsdc, 0);

  const runtimes = completed
    .filter((j) => j.startedAt && j.endedAt)
    .map((j) => (Date.parse(j.endedAt!) - Date.parse(j.startedAt!)) / MIN);

  const decided = completed.length + failed.length;

  agent.stats = {
    bids: bidOn.length,
    won: won.length,
    completed: completed.length,
    failed: failed.length,
    active: active.length,
    // Null, not zero: an agent with no decided jobs has no success rate, and
    // showing 0% would libel a brand-new agent.
    successRate: decided ? completed.length / decided : null,
    earnedUsdc: money(earned),
    medianRuntimeMin: runtimes.length ? Math.round(median(runtimes)!) : null,
    disputes: agent.status === "suspended" ? 1 : 0,
  };
}

/* ── query layer ───────────────────────────────────────────────────────── */

export type SortDir = "asc" | "desc";

/** The largest page a caller may ask for by number. Asking for every row is a
 *  separate, named request — see `PageSize`. */
export const MAX_PAGE_SIZE = 100;

/**
 * A row count, or `"all"`.
 *
 * `"all"` exists because "give me every matching row" is a real question — the
 * facet counts under the filter chips ask it — and it used to be spelled
 * `pageSize: 100`, which is not that question. It only agreed with the clamp by
 * coincidence, and the first time this dataset passes 100 rows the counts would
 * have started under-reporting with nothing on screen to give it away.
 */
export type PageSize = number | "all";

export type ListQuery = {
  network?: Network;
  q?: string;
  status?: string[];
  /** Jobs only: match any of these required skills. */
  skills?: string[];
  /** Jobs only: inclusive budget bounds in USDC. */
  minBudget?: number | null;
  maxBudget?: number | null;
  sort?: string;
  dir?: SortDir;
  page?: number;
  pageSize?: PageSize;
};

export type Paged<T> = {
  data: T[];
  page: number;
  pageSize: number;
  /** Rows matching the filter across all pages — the number the UI must report. */
  total: number;
  totalPages: number;
  sort: string;
  dir: SortDir;
  network: Network;
  asOf: string;
  source: "sample";
};

export const AGENT_SORTS = ["name", "status", "won", "successRate", "earned", "registered", "lastSeen"] as const;
export const JOB_SORTS = ["created", "title", "status", "budget", "bids", "escrow"] as const;
export const TX_SORTS = ["time", "kind", "amount", "round", "status"] as const;

function paginate<T>(rows: T[], query: ListQuery, sort: string, defaultSize: number, network: Network): Paged<T> {
  const total = rows.length;
  // An empty result still has a page size, or `first–last of 0` divides by zero.
  const pageSize =
    query.pageSize === "all"
      ? Math.max(total, 1)
      : Math.min(Math.max(query.pageSize ?? defaultSize, 5), MAX_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Clamp rather than 404 — a filter change that shortens the result set must
  // not strand the reader on an empty page 7.
  const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total,
    totalPages,
    sort,
    dir: query.dir ?? "desc",
    network,
    asOf: SNAPSHOT,
    source: "sample",
  };
}

const cmp = (a: number | string | null, b: number | string | null): number => {
  // Nulls sort last in both directions — "no data yet" is not "worst".
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number);
};

function matches(haystack: string[], needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => h.toLowerCase().includes(q));
}

/** Simulates the network hop a real indexer route would sit behind. */
async function respond<T>(value: T): Promise<T> {
  return value;
}

export async function fetchAgents(query: ListQuery = {}): Promise<Paged<Agent>> {
  const network = query.network ?? DEFAULT_NETWORK;
  const sort = (AGENT_SORTS as readonly string[]).includes(query.sort ?? "") ? query.sort! : "won";
  const dir = query.dir ?? "desc";

  let rows = AGENTS.filter((a) => a.network === network);
  if (query.status?.length) rows = rows.filter((a) => query.status!.includes(a.status));
  if (query.q) rows = rows.filter((a) => matches([a.name, a.handle, a.id, a.address, ...a.skills], query.q!));

  const key = (a: Agent): number | string | null => {
    switch (sort) {
      case "name": return a.name;
      case "status": return a.status;
      case "won": return a.stats.won;
      case "successRate": return a.stats.successRate;
      case "earned": return a.stats.earnedUsdc;
      case "registered": return Date.parse(a.registeredAt);
      case "lastSeen": return Date.parse(a.lastSeenAt);
      default: return a.stats.won;
    }
  };
  rows = [...rows].sort((a, b) => (dir === "asc" ? cmp(key(a), key(b)) : cmp(key(b), key(a))));

  return respond(paginate(rows, { ...query, dir }, sort, 10, network));
}

export async function fetchAgent(id: string): Promise<Agent | null> {
  const key = id.toLowerCase();
  return respond(AGENTS.find((a) => a.id.toLowerCase() === key || a.handle.toLowerCase() === key) ?? null);
}

export async function fetchJobs(query: ListQuery = {}): Promise<Paged<Job>> {
  const network = query.network ?? DEFAULT_NETWORK;
  const sort = (JOB_SORTS as readonly string[]).includes(query.sort ?? "") ? query.sort! : "created";
  const dir = query.dir ?? "desc";

  let rows = JOBS.filter((j) => j.network === network);
  if (query.status?.length) rows = rows.filter((j) => query.status!.includes(j.status));
  // Skills are OR'd, not AND'd: picking "ocr" and "vision" asks for work either
  // skill could take, which is the question someone shopping for work has.
  if (query.skills?.length) rows = rows.filter((j) => j.skillsRequired.some((s) => query.skills!.includes(s)));
  if (query.minBudget != null) rows = rows.filter((j) => j.budgetUsdc >= query.minBudget!);
  if (query.maxBudget != null) rows = rows.filter((j) => j.budgetUsdc <= query.maxBudget!);
  if (query.q) rows = rows.filter((j) => matches([j.title, j.id, j.requester, ...j.skillsRequired], query.q!));

  const key = (j: Job): number | string | null => {
    switch (sort) {
      case "title": return j.title;
      case "status": return j.status;
      case "budget": return j.budgetUsdc;
      case "bids": return j.bids.length;
      case "escrow": return j.escrow.heldUsdc;
      case "created":
      default: return Date.parse(j.createdAt);
    }
  };
  rows = [...rows].sort((a, b) => (dir === "asc" ? cmp(key(a), key(b)) : cmp(key(b), key(a))));

  return respond(paginate(rows, { ...query, dir }, sort, 10, network));
}

export async function fetchJob(id: string): Promise<Job | null> {
  const key = id.toLowerCase();
  return respond(JOBS.find((j) => j.id.toLowerCase() === key) ?? null);
}

/**
 * Everything the job board's filter controls need, measured against the whole
 * network slice rather than the current page: how many jobs sit at each status,
 * which skills are actually asked for, and the real budget range. Offering a
 * skill nobody has posted, or a budget slider wider than the data, invites the
 * reader to filter their way to an empty table.
 */
export type JobFacets = {
  network: Network;
  total: number;
  status: { value: JobStatus; count: number }[];
  skills: { value: string; count: number }[];
  budget: { min: number; max: number };
  asOf: string;
  source: "sample";
};

export async function fetchJobFacets(network: Network = DEFAULT_NETWORK): Promise<JobFacets> {
  const rows = JOBS.filter((j) => j.network === network);

  const skillCounts = new Map<string, number>();
  for (const job of rows) {
    for (const skill of job.skillsRequired) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
  }

  const budgets = rows.map((j) => j.budgetUsdc);

  return respond({
    network,
    total: rows.length,
    status: (
      ["open", "bidding", "running", "verifying", "verified", "failed", "cancelled", "expired"] as JobStatus[]
    ).map((value) => ({ value, count: rows.filter((j) => j.status === value).length })),
    skills: [...skillCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    budget: { min: budgets.length ? Math.min(...budgets) : 0, max: budgets.length ? Math.max(...budgets) : 0 },
    asOf: SNAPSHOT,
    source: "sample",
  });
}

export async function fetchTransactions(query: ListQuery = {}): Promise<Paged<Transaction>> {
  const network = query.network ?? DEFAULT_NETWORK;
  const sort = (TX_SORTS as readonly string[]).includes(query.sort ?? "") ? query.sort! : "time";
  const dir = query.dir ?? "desc";

  let rows = TRANSACTIONS.filter((t) => t.network === network);
  if (query.status?.length) rows = rows.filter((t) => query.status!.includes(t.kind) || query.status!.includes(t.status));
  if (query.q) {
    rows = rows.filter((t) =>
      matches([t.id, t.from, t.to, t.jobId ?? "", t.agentId ?? "", t.kind, t.x402?.requestId ?? ""], query.q!),
    );
  }

  const key = (t: Transaction): number | string | null => {
    switch (sort) {
      case "kind": return t.kind;
      case "amount": return t.amountUsdc;
      case "round": return t.round;
      case "status": return t.status;
      case "time":
      default: return Date.parse(t.timestamp);
    }
  };
  rows = [...rows].sort((a, b) => (dir === "asc" ? cmp(key(a), key(b)) : cmp(key(b), key(a))));

  return respond(paginate(rows, { ...query, dir }, sort, 15, network));
}

/** Every transaction touching one job, oldest first — the job's money trail. */
/** A single settled payment. Null rather than throwing so the route can 404. */
export async function fetchTransaction(id: string): Promise<Transaction | null> {
  return TRANSACTIONS.find((t) => t.id === id) ?? null;
}

export async function fetchJobTransactions(jobId: string): Promise<Transaction[]> {
  return respond(
    TRANSACTIONS.filter((t) => t.jobId === jobId).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
  );
}

export async function fetchAgentJobs(agentId: string): Promise<{ won: Job[]; bidOn: Job[] }> {
  const won = JOBS.filter((j) => j.winnerAgentId === agentId).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const bidOn = JOBS.filter((j) => j.winnerAgentId !== agentId && j.bids.some((b) => b.agentId === agentId)).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return respond({ won, bidOn });
}

export type Overview = {
  network: Network;
  asOf: string;
  source: "sample";
  head: { round: number; timestamp: string };
  agents: { total: number; online: number; degraded: number; offline: number; suspended: number };
  jobs: Record<"total" | JobStatus, number>;
  settlement: {
    releasedUsdc: number;
    inEscrowUsdc: number;
    refundedUsdc: number;
    protocolFeesUsdc: number;
    /** Jobs actually holding funds right now. Lower than the in-flight count
     *  whenever a job is posted but its escrow has not been funded, so the
     *  headline figure is never attributed to a job contributing nothing. */
    escrowedJobs: number;
    transactions: number;
    failedTransactions: number;
  };
  verification: { passed: number; failed: number; passRate: number | null };
  recentAgents: Agent[];
  recentJobs: Job[];
  recentTransactions: Transaction[];
};

export async function fetchOverview(network: Network = DEFAULT_NETWORK): Promise<Overview> {
  const agents = AGENTS.filter((a) => a.network === network);
  const jobs = JOBS.filter((j) => j.network === network);
  const txs = TRANSACTIONS.filter((t) => t.network === network);
  const confirmed = txs.filter((t) => t.status === "confirmed");
  const sum = (kind: TxKind) =>
    money(confirmed.filter((t) => t.kind === kind).reduce((s, t) => s + t.amountUsdc, 0));

  const passed = jobs.filter((j) => j.verification.state === "passed").length;
  const failed = jobs.filter((j) => j.verification.state === "failed").length;

  const countBy = (s: JobStatus) => jobs.filter((j) => j.status === s).length;

  return respond({
    network,
    asOf: SNAPSHOT,
    source: "sample",
    head: { round: HEAD_ROUND[network], timestamp: SNAPSHOT },
    agents: {
      total: agents.length,
      online: agents.filter((a) => a.status === "online").length,
      degraded: agents.filter((a) => a.status === "degraded").length,
      offline: agents.filter((a) => a.status === "offline").length,
      suspended: agents.filter((a) => a.status === "suspended").length,
    },
    jobs: {
      total: jobs.length,
      open: countBy("open"),
      bidding: countBy("bidding"),
      running: countBy("running"),
      verifying: countBy("verifying"),
      verified: countBy("verified"),
      failed: countBy("failed"),
      cancelled: countBy("cancelled"),
      expired: countBy("expired"),
    },
    settlement: {
      releasedUsdc: sum("escrow-release"),
      inEscrowUsdc: money(jobs.reduce((s, j) => s + j.escrow.heldUsdc, 0)),
      escrowedJobs: jobs.filter((j) => j.escrow.heldUsdc > 0).length,
      refundedUsdc: sum("escrow-refund"),
      protocolFeesUsdc: money(confirmed.reduce((s, t) => s + t.protocolFeeUsdc, 0)),
      transactions: txs.length,
      failedTransactions: txs.filter((t) => t.status === "failed").length,
    },
    verification: { passed, failed, passRate: passed + failed ? passed / (passed + failed) : null },
    recentAgents: [...agents].sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt)).slice(0, 5),
    recentJobs: [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6),
    recentTransactions: confirmed.slice(0, 6),
  });
}

/* ── leaderboard ───────────────────────────────────────────────────────── */

/** How far back the previous ranking is measured. A week is long enough that a
 *  single settlement does not reshuffle the board every hour. */
export const LEADERBOARD_LOOKBACK_DAYS = 7;

export type LeaderboardRow = {
  rank: number;
  /**
   * Where this agent ranked a week before the capture, by the same measure.
   * Null when it had settled nothing by then — an agent that has just arrived
   * has not climbed, and drawing it as a climb would invent a trend.
   */
  previousRank: number | null;
  /** `previousRank - rank`; positive is a climb. Null for a new entrant. */
  movement: number | null;
  agent: Agent;
  volumeUsdc: number;
  settlements: number;
  /** Share of all settled volume on this network, for the bar width. */
  share: number;
};

export type Leaderboard = {
  network: Network;
  rows: LeaderboardRow[];
  /** Settled volume across every agent, not just the rows returned. */
  totalUsdc: number;
  rankedAgents: number;
  lookbackDays: number;
  comparedTo: string;
  asOf: string;
  source: "sample";
};

/** Confirmed escrow released to each agent up to `untilMs`. */
function settledByAgent(network: Network, untilMs: number): Map<string, { volume: number; count: number }> {
  const out = new Map<string, { volume: number; count: number }>();
  for (const t of TRANSACTIONS) {
    if (t.network !== network || t.kind !== "escrow-release" || t.status !== "confirmed" || !t.agentId) continue;
    if (Date.parse(t.timestamp) > untilMs) continue;
    const row = out.get(t.agentId) ?? { volume: 0, count: 0 };
    row.volume = money(row.volume + t.amountUsdc);
    row.count += 1;
    out.set(t.agentId, row);
  }
  return out;
}

/** Ties break on settlement count, then name, so the order is stable between
 *  the two rankings and a tie never reads as movement. */
function rankAgents(totals: Map<string, { volume: number; count: number }>): string[] {
  return [...totals.entries()]
    .filter(([, v]) => v.volume > 0)
    .sort(
      ([aId, a], [bId, b]) =>
        b.volume - a.volume ||
        b.count - a.count ||
        (AGENTS_BY_ID.get(aId)?.name ?? aId).localeCompare(AGENTS_BY_ID.get(bId)?.name ?? bId),
    )
    .map(([id]) => id);
}

export async function fetchLeaderboard(
  network: Network = DEFAULT_NETWORK,
  limit = 8,
): Promise<Leaderboard> {
  const cutoff = NOW - LEADERBOARD_LOOKBACK_DAYS * DAY;
  const now = settledByAgent(network, NOW);
  const then = settledByAgent(network, cutoff);

  const order = rankAgents(now);
  const previousOrder = rankAgents(then);
  const totalUsdc = money([...now.values()].reduce((s, v) => s + v.volume, 0));

  const rows: LeaderboardRow[] = order.slice(0, limit).map((id, i) => {
    const previousIndex = previousOrder.indexOf(id);
    const previousRank = previousIndex === -1 ? null : previousIndex + 1;
    const stats = now.get(id)!;
    return {
      rank: i + 1,
      previousRank,
      movement: previousRank == null ? null : previousRank - (i + 1),
      agent: AGENTS_BY_ID.get(id)!,
      volumeUsdc: stats.volume,
      settlements: stats.count,
      share: totalUsdc ? stats.volume / totalUsdc : 0,
    };
  });

  return respond({
    network,
    rows,
    totalUsdc,
    rankedAgents: order.length,
    lookbackDays: LEADERBOARD_LOOKBACK_DAYS,
    comparedTo: iso(cutoff),
    asOf: SNAPSHOT,
    source: "sample",
  });
}

/* ── settled volume over time ──────────────────────────────────────────── */

export type VolumePoint = {
  /** UTC midnight the bucket opens at. */
  day: string;
  releasedUsdc: number;
  settlements: number;
  /** Running total through the end of this bucket. */
  cumulativeUsdc: number;
};

export type VolumeSeries = {
  network: Network;
  points: VolumePoint[];
  /** Largest single day, which is what the bar axis is scaled to. */
  peakUsdc: number;
  totalUsdc: number;
  settlements: number;
  /** Days that saw at least one settlement. The gaps are the point. */
  activeDays: number;
  asOf: string;
  source: "sample";
};

/**
 * Daily settled volume across the capture window. Buckets run from the first
 * settlement's UTC day to the capture day, gaps included — a chart that drops
 * empty days would compress a quiet week into a dense-looking one.
 */
export async function fetchVolumeSeries(network: Network = DEFAULT_NETWORK): Promise<VolumeSeries> {
  const settled = TRANSACTIONS.filter(
    (t) => t.network === network && t.kind === "escrow-release" && t.status === "confirmed",
  );

  if (settled.length === 0) {
    return respond({
      network,
      points: [],
      peakUsdc: 0,
      totalUsdc: 0,
      settlements: 0,
      activeDays: 0,
      asOf: SNAPSHOT,
      source: "sample",
    });
  }

  const dayStart = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const first = dayStart(Math.min(...settled.map((t) => Date.parse(t.timestamp))));
  const last = dayStart(NOW);

  const points: VolumePoint[] = [];
  let cumulative = 0;
  for (let d = first; d <= last; d += DAY) {
    const inDay = settled.filter((t) => {
      const at = Date.parse(t.timestamp);
      return at >= d && at < d + DAY;
    });
    const released = money(inDay.reduce((s, t) => s + t.amountUsdc, 0));
    cumulative = money(cumulative + released);
    points.push({ day: iso(d), releasedUsdc: released, settlements: inDay.length, cumulativeUsdc: cumulative });
  }

  return respond({
    network,
    points,
    peakUsdc: Math.max(...points.map((p) => p.releasedUsdc)),
    totalUsdc: cumulative,
    settlements: settled.length,
    activeDays: points.filter((p) => p.settlements > 0).length,
    asOf: SNAPSHOT,
    source: "sample",
  });
}

/* ── settlement feed ───────────────────────────────────────────────────── */

/** The two transaction kinds that close a job out. Funding a job opens it. */
export const SETTLEMENT_KINDS: readonly TxKind[] = ["escrow-release", "escrow-refund"];

export type Settlement = {
  transaction: Transaction;
  job: Job | null;
  agent: Agent | null;
};

/**
 * Recent settlements, newest first — the source for `/feed.json`. Confirmed
 * only: a rejected release moved no money, so it did not settle anything. The
 * rejected rows are still on the transactions page, where they belong.
 */
export async function fetchSettlements(network: Network = DEFAULT_NETWORK, limit = 40): Promise<Settlement[]> {
  return respond(
    TRANSACTIONS.filter(
      (t) => t.network === network && t.status === "confirmed" && SETTLEMENT_KINDS.includes(t.kind),
    )
      .slice(0, Math.max(1, Math.min(limit, MAX_PAGE_SIZE)))
      .map((transaction) => ({
        transaction,
        job: transaction.jobId ? JOBS_BY_ID.get(transaction.jobId) ?? null : null,
        agent: transaction.agentId ? AGENTS_BY_ID.get(transaction.agentId) ?? null : null,
      })),
  );
}

/* ── global search ─────────────────────────────────────────────────────── */

export type SearchHit = {
  kind: "agent" | "job" | "transaction";
  id: string;
  href: string;
  title: string;
  subtitle: string;
  /** Right-aligned trailing detail — a status, an amount, a timestamp. */
  meta: string;
  network: Network;
  /** The term named this record outright rather than merely appearing in it. */
  exact: boolean;
};

export type SearchResults = {
  term: string;
  network: Network;
  hits: SearchHit[];
  /** Matches beyond the returned ones, so the palette can say so honestly. */
  more: number;
};

/** Query-string suffix that keeps a non-default network on a link. */
function netSuffix(network: Network): string {
  return network === DEFAULT_NETWORK ? "" : `?network=${network}`;
}

const jobHit = (j: Job, exact: boolean): SearchHit => ({
  kind: "job",
  id: j.id,
  href: `/jobs/${j.id}${netSuffix(j.network)}`,
  title: j.title,
  subtitle: `${j.id} · ${j.skillsRequired.join(" · ")}`,
  meta: `${j.status} · ${j.budgetUsdc} USDC`,
  network: j.network,
  exact,
});

const agentHit = (a: Agent, exact: boolean): SearchHit => ({
  kind: "agent",
  id: a.id,
  href: `/agents/${a.id}${netSuffix(a.network)}`,
  title: a.name,
  subtitle: `${a.handle} · ${a.skills.join(" · ")}`,
  meta: `${a.status} · ${a.stats.won} won`,
  network: a.network,
  exact,
});

const txHit = (t: Transaction, exact: boolean): SearchHit => ({
  kind: "transaction",
  id: t.id,
  href: `/transactions/${t.id}${netSuffix(t.network)}`,
  title: `${t.kind.replace("escrow-", "escrow ")} · ${t.amountUsdc} USDC`,
  subtitle: `${t.id.slice(0, 24)}… · round ${t.round}`,
  meta: t.status,
  network: t.network,
  exact,
});

/**
 * One search across all three record types.
 *
 * Exact identifier matches come first and are searched across BOTH networks —
 * pasting an id you were given should never depend on which network toggle you
 * happen to be on. Everything after that is a text match inside the selected
 * network, capped per kind so no single type can crowd the other two out.
 */
export async function searchAll(
  term: string,
  network: Network = DEFAULT_NETWORK,
  perKind = 4,
): Promise<SearchResults> {
  const t = term.trim();
  if (!t) return respond({ term: t, network, hits: [], more: 0 });

  const lower = t.toLowerCase();
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  const add = (hit: SearchHit) => {
    if (seen.has(hit.id)) return;
    seen.add(hit.id);
    hits.push(hit);
  };

  const exactAgent = AGENTS.find(
    (a) => a.id.toLowerCase() === lower || a.handle.toLowerCase() === lower || a.address === t,
  );
  if (exactAgent) add(agentHit(exactAgent, true));

  const exactJob = JOBS.find((j) => j.id.toLowerCase() === lower);
  if (exactJob) add(jobHit(exactJob, true));

  const exactTx = TRANSACTIONS.find((x) => x.id === t.toUpperCase());
  if (exactTx) add(txHit(exactTx, true));

  const agentRows = AGENTS.filter(
    (a) => a.network === network && matches([a.name, a.handle, a.id, a.address, ...a.skills], t),
  );
  const jobRows = JOBS.filter(
    (j) => j.network === network && matches([j.title, j.id, j.requester, ...j.skillsRequired], t),
  );
  const txRows = TRANSACTIONS.filter(
    (x) =>
      x.network === network &&
      matches([x.id, x.from, x.to, x.jobId ?? "", x.agentId ?? "", x.kind, x.x402?.requestId ?? ""], t),
  );

  for (const a of agentRows.slice(0, perKind)) add(agentHit(a, false));
  for (const j of jobRows.slice(0, perKind)) add(jobHit(j, false));
  for (const x of txRows.slice(0, perKind)) add(txHit(x, false));

  const more =
    Math.max(0, agentRows.length - perKind) +
    Math.max(0, jobRows.length - perKind) +
    Math.max(0, txRows.length - perKind);
  return respond({ term: t, network, hits, more });
}

/* Identifier resolution used to live here as `resolveQuery`, feeding a header
   input that could only ever land you on one page. `searchAll` above does the
   same resolution — exact ids first, across both networks — and then shows the
   text matches beside it, so it replaced rather than duplicated it. */

/** Route lists for the sitemap. */
export const ALL_AGENT_IDS = AGENTS.map((a) => a.id);
export const ALL_JOB_IDS = JOBS.map((j) => j.id);

/** Dataset totals, quoted verbatim wherever the explorer describes itself. */
export const DATASET = {
  agents: AGENTS.length,
  jobs: JOBS.length,
  transactions: TRANSACTIONS.length,
  snapshot: SNAPSHOT,
} as const;
