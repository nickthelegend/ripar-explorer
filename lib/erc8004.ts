/**
 * A reader for Ripar's three ERC-8004 registries, live on Algorand TestNet.
 *
 * Every function here returns what the chain says or throws. There is no
 * fallback dataset, no "last known good" cache and no zero-filled placeholder
 * standing in for a failed read, because a registry page that quietly degrades
 * into fiction is worse than one that says it could not reach algod.
 *
 * HOW THE RECORDS ARE STORED. Each registry keeps its records in box storage,
 * one box per record, named `<prefix><key>`:
 *
 *   IdentityRegistry    ag_<uint64 agent id>   dm_<domain>   ad_<32-byte address>
 *   ReputationRegistry  sc_<uint64 agent id>   pd_<32-byte payment txid>
 *   ValidationRegistry  jb_<uint64 job id>
 *
 * The uint64 keys are big-endian, and the values are ARC-4 encoded structs.
 * Those structs carry dynamic members — a domain is a string, a spec hash is a
 * `byte[]` — so their fields do NOT sit at fixed offsets and cannot be sliced
 * out by hand. The layouts below are transcribed from the ARC-56 specs the
 * contracts were compiled with, and the ABI type string is built from the same
 * list, so algosdk resolves the offsets rather than this file guessing them.
 *
 *   ripar-contracts/artifacts/identity/IdentityRegistry.arc56.json          → AgentInfo
 *   ripar-contracts/artifacts/reputation_registry/ReputationRegistry.arc56.json → Score
 *   ripar-contracts/artifacts/validation_registry/ValidationRegistry.arc56.json → Job
 *
 * Reads go straight to public AlgoNode endpoints from the server. No key, no
 * proxy of ours in the path — the same request a reader can paste into curl.
 */

import { ABIType, type ABIValue } from "algosdk";
import {
  BOX_PREFIX,
  REGISTRIES,
  TESTNET_ALGOD,
  TESTNET_INDEXER,
  type RegistryKey,
} from "./registries";

export * from "./registries";

/* ── transport ─────────────────────────────────────────────────────────── */

/** Carries the URL that failed, so the UI can print something actionable. */
export class RegistryReadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RegistryReadError";
  }
}

/**
 * `no-store`, always. These pages describe a mutable registry; letting Next
 * cache a read at build time would freeze the agent list at whatever it was
 * the day the site was deployed and present that as current.
 */
async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: "no-store" });
  } catch (e) {
    throw new RegistryReadError(`Network error reaching ${hostOf(url)}: ${(e as Error).message}`, url);
  }
  if (!res.ok) {
    // algod puts the reason in the body and often sends no status text at all,
    // so the status line on its own reads as a bare "404" and tells a reader
    // nothing about which of several things went wrong.
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = ` — ${body.message}`;
    } catch {
      // Not JSON. The status line is all there is.
    }
    throw new RegistryReadError(`${res.status} ${res.statusText}`.trim() + detail, url, res.status);
  }
  return (await res.json()) as T;
}

/** A 404 from a box read means "no such record", which is an answer, not a fault. */
async function getOrNull<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    return await get<T>(url, signal);
  } catch (e) {
    if (e instanceof RegistryReadError && e.status === 404) return null;
    throw e;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* ── byte helpers ──────────────────────────────────────────────────────── */

const b64ToBytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));
const bytesToB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const toHex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Big-endian uint64, the encoding every id-keyed BoxMap uses for its key. */
function uint64Key(prefix: string, id: number | bigint): Uint8Array {
  const out = new Uint8Array(prefix.length + 8);
  for (let i = 0; i < prefix.length; i += 1) out[i] = prefix.charCodeAt(i);
  new DataView(out.buffer).setBigUint64(prefix.length, BigInt(id), false);
  return out;
}

function readUint64BE(bytes: Uint8Array, offset = 0): number {
  return Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, false));
}

/**
 * Algorand transaction ids are the raw 32-byte digest in RFC-4648 base32 with
 * the padding dropped. `encodeAddress` is the wrong tool — it appends a
 * checksum — so this is the plain encoder, 52 characters out for 32 bytes in.
 */
function base32(bytes: Uint8Array): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31];
  return out;
}

/* ── ARC-4 struct layouts ──────────────────────────────────────────────── */

type Field = { name: string; type: string };

/** IdentityRegistry.arc56.json → structs.AgentInfo */
const AGENT_INFO: Field[] = [
  { name: "agent_id", type: "uint64" },
  { name: "agent_domain", type: "string" },
  { name: "agent_address", type: "address" },
  { name: "registered_at", type: "uint64" },
  { name: "updated_at", type: "uint64" },
];

/** ReputationRegistry.arc56.json → structs.Score */
const SCORE: Field[] = [
  { name: "agent_id", type: "uint64" },
  { name: "jobs_paid", type: "uint64" },
  { name: "volume_micro", type: "uint64" },
  { name: "validated", type: "uint64" },
  { name: "disputed", type: "uint64" },
  { name: "first_at", type: "uint64" },
  { name: "last_at", type: "uint64" },
];

/** ValidationRegistry.arc56.json → structs.Job */
const JOB: Field[] = [
  { name: "job_id", type: "uint64" },
  { name: "client", type: "address" },
  { name: "server_agent_id", type: "uint64" },
  { name: "validator_agent_id", type: "uint64" },
  { name: "budget_micro", type: "uint64" },
  { name: "spec_hash", type: "byte[]" },
  { name: "result_hash", type: "byte[]" },
  { name: "status", type: "uint64" },
  { name: "created_at", type: "uint64" },
  { name: "updated_at", type: "uint64" },
];

/** Cached: parsing an ABI type string allocates a tree, and these never change. */
const codecs = new Map<Field[], ReturnType<typeof ABIType.from>>();
function codecFor(schema: Field[]) {
  let c = codecs.get(schema);
  if (!c) {
    c = ABIType.from(`(${schema.map((f) => f.type).join(",")})`);
    codecs.set(schema, c);
  }
  return c;
}

/**
 * Decode a box value into a name→value map. Reading fields by name rather than
 * by index is what makes a reordered struct a loud failure instead of a page
 * that renders a timestamp as a budget.
 */
function decodeStruct(schema: Field[], raw: Uint8Array): Record<string, ABIValue> {
  const parts = codecFor(schema).decode(raw) as ABIValue[];
  if (parts.length !== schema.length) {
    throw new RegistryReadError(
      `Box value decoded to ${parts.length} fields but the ARC-56 struct declares ${schema.length}`,
      "arc4",
    );
  }
  return Object.fromEntries(schema.map((f, i) => [f.name, parts[i]]));
}

/** uint64 fields arrive as bigint. Ids, unix seconds and USDC base units are all
 *  far below 2^53, so a Number is exact and every consumer can do arithmetic. */
const num = (v: ABIValue) => Number(v as bigint);
const str = (v: ABIValue) => String(v);
const bytes = (v: ABIValue) => Uint8Array.from(v as number[]);

/* ── box plumbing ──────────────────────────────────────────────────────── */

type BoxList = { boxes?: Array<{ name?: string }> };
type BoxValue = { name?: string; round?: number; value?: string };

const boxesUrl = (appId: number) => `${TESTNET_ALGOD}/v2/applications/${appId}/boxes`;
const boxUrl = (appId: number, name: Uint8Array) =>
  `${TESTNET_ALGOD}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(bytesToB64(name))}`;

/** Drops the misses from a batch without widening the element type. */
const present = <T,>(v: T | null): v is T => v != null;

/** Names of every box on an app whose prefix matches, as raw bytes. */
async function listBoxNames(appId: number, prefix: string, signal?: AbortSignal): Promise<Uint8Array[]> {
  const list = await get<BoxList>(boxesUrl(appId), signal);
  const p = new TextEncoder().encode(prefix);
  const out: Uint8Array[] = [];
  for (const box of list.boxes ?? []) {
    if (!box.name) continue;
    const name = b64ToBytes(box.name);
    if (name.length >= p.length && p.every((byte, i) => name[i] === byte)) out.push(name);
  }
  return out;
}

async function readBox(appId: number, name: Uint8Array, signal?: AbortSignal): Promise<Uint8Array | null> {
  const box = await getOrNull<BoxValue>(boxUrl(appId, name), signal);
  if (!box?.value) return null;
  return b64ToBytes(box.value);
}

/**
 * How many boxes one call will fetch the value of. Each value is its own
 * round-trip, so an unbounded registry would mean an unbounded page load; the
 * caller is told the true total separately and can say what it is not showing.
 */
export const READ_LIMIT = 120;

/**
 * Box values have to be fetched one at a time — algod has no batch read — but
 * firing all of them at once earns a 429 from a public node, and a rate-limit
 * on one box would take down the whole page. Eight in flight is quick and
 * stays inside AlgoNode's free tier.
 */
const CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

/* ── identity ──────────────────────────────────────────────────────────── */

export type OnchainAgent = {
  agentId: number;
  /** The agent's domain, where its agent card is served from. */
  domain: string;
  /** The address that registered it and is the only one that may update it. */
  address: string;
  /** Unix seconds, from the block that carried the registration. */
  registeredAt: number;
  updatedAt: number;
};

function toAgent(raw: Uint8Array): OnchainAgent {
  const f = decodeStruct(AGENT_INFO, raw);
  return {
    agentId: num(f.agent_id),
    domain: str(f.agent_domain),
    address: str(f.agent_address),
    registeredAt: num(f.registered_at),
    updatedAt: num(f.updated_at),
  };
}

/**
 * Every agent in the Identity Registry, lowest id first.
 *
 * The `ag_` boxes are walked rather than `total_agents()` being counted up to,
 * because a simulated readonly call answers about the id space while the boxes
 * answer about what actually exists. If the two ever disagree the boxes are
 * right.
 */
export async function listAgents(limit = READ_LIMIT, signal?: AbortSignal): Promise<OnchainAgent[]> {
  const appId = REGISTRIES.identity.appId;
  const names = await listBoxNames(appId, BOX_PREFIX.agents, signal);
  const ordered = names
    .filter((n) => n.length === BOX_PREFIX.agents.length + 8)
    .sort((a, b) => readUint64BE(a, BOX_PREFIX.agents.length) - readUint64BE(b, BOX_PREFIX.agents.length))
    .slice(0, limit);

  const values = await mapLimit(ordered, (n) => readBox(appId, n, signal));
  // A box that vanished between the list and the read is a real race, not a
  // reason to invent a row.
  return values.filter(present).map(toAgent);
}

/** One agent, or null when no `ag_` box holds that id. */
export async function getAgent(agentId: number, signal?: AbortSignal): Promise<OnchainAgent | null> {
  const raw = await readBox(REGISTRIES.identity.appId, uint64Key(BOX_PREFIX.agents, agentId), signal);
  return raw ? toAgent(raw) : null;
}

/** The id registered for a domain, or null. Mirrors `resolve_by_domain`. */
export async function resolveByDomain(domain: string, signal?: AbortSignal): Promise<number | null> {
  const prefix = new TextEncoder().encode(BOX_PREFIX.agentByDomain);
  const key = new TextEncoder().encode(domain);
  const name = new Uint8Array(prefix.length + key.length);
  name.set(prefix);
  name.set(key, prefix.length);
  const raw = await readBox(REGISTRIES.identity.appId, name, signal);
  return raw ? readUint64BE(raw) : null;
}

/* ── reputation ────────────────────────────────────────────────────────── */

export type OnchainScore = {
  agentId: number;
  /** Settled payments credited to this agent. One payment can be counted once. */
  jobsPaid: number;
  volumeMicro: number;
  volumeUsdc: number;
  validated: number;
  disputed: number;
  firstAt: number;
  lastAt: number;
};

function toScore(raw: Uint8Array): OnchainScore {
  const f = decodeStruct(SCORE, raw);
  const volumeMicro = num(f.volume_micro);
  return {
    agentId: num(f.agent_id),
    jobsPaid: num(f.jobs_paid),
    volumeMicro,
    volumeUsdc: volumeMicro / 1e6,
    validated: num(f.validated),
    disputed: num(f.disputed),
    firstAt: num(f.first_at),
    lastAt: num(f.last_at),
  };
}

/**
 * An agent's score, or null when it has no `sc_` box.
 *
 * Null is not zero. The contract's `get_score` returns an all-zero struct for
 * an unknown agent, which reads identically to an agent that was paid nothing —
 * so this reads the box directly and lets the caller draw the distinction
 * between "no record yet" and "a record that says nothing happened".
 */
export async function getScore(agentId: number, signal?: AbortSignal): Promise<OnchainScore | null> {
  const raw = await readBox(REGISTRIES.reputation.appId, uint64Key(BOX_PREFIX.scores, agentId), signal);
  return raw ? toScore(raw) : null;
}

/** Scores for a set of agents, keyed by id. Missing ids simply have no entry. */
export async function getScores(
  agentIds: number[],
  signal?: AbortSignal,
): Promise<Map<number, OnchainScore>> {
  const rows = await mapLimit(agentIds, async (id) => [id, await getScore(id, signal)] as const);
  return new Map(rows.filter((r): r is [number, OnchainScore] => r[1] != null));
}

export type CountedPayment = {
  /** The 32-byte id of the transfer, base32 encoded the way an explorer shows it. */
  paymentTxId: string;
  /** The agent the payment was credited to. */
  agentId: number;
};

/**
 * Every payment the Reputation Registry has already counted, from the `pd_`
 * boxes. This set IS the anti-inflation mechanism: `accept_feedback` refuses a
 * txid that is already in here, so a score can never be run up by replaying one
 * settlement.
 *
 * Worth being precise about what it does not prove. The contract checks that
 * the id is 32 bytes and unseen; it does not verify that a transfer with that
 * id exists. `paymentResolves` is how the UI checks that separately.
 */
export async function listCountedPayments(
  limit = READ_LIMIT,
  signal?: AbortSignal,
): Promise<CountedPayment[]> {
  const appId = REGISTRIES.reputation.appId;
  const prefixLen = BOX_PREFIX.countedPayments.length;
  const names = (await listBoxNames(appId, BOX_PREFIX.countedPayments, signal))
    .filter((n) => n.length === prefixLen + 32)
    .slice(0, limit);

  const rows = await mapLimit(names, async (name) => {
    const raw = await readBox(appId, name, signal);
    if (!raw) return null;
    return { paymentTxId: base32(name.slice(prefixLen)), agentId: readUint64BE(raw) };
  });
  return rows.filter(present);
}

/**
 * Does a recorded payment id actually resolve to a TestNet transaction?
 *
 * Returns null when the indexer itself could not be reached — "we do not know"
 * and "it is not there" must not render as the same thing.
 */
export async function paymentResolves(txId: string, signal?: AbortSignal): Promise<boolean | null> {
  const url = `${TESTNET_INDEXER}/v2/transactions/${txId}`;
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    return true;
  } catch {
    return null;
  }
}

/** The same check across a batch, bounded so a busy registry cannot flood the
 *  indexer. Keyed by transaction id; `null` means the check itself failed. */
export async function resolvePayments(
  payments: CountedPayment[],
  signal?: AbortSignal,
): Promise<Map<string, boolean | null>> {
  const rows = await mapLimit(
    payments,
    async (p) => [p.paymentTxId, await paymentResolves(p.paymentTxId, signal)] as const,
  );
  return new Map(rows);
}

/* ── validation / the job board ────────────────────────────────────────── */

/** Status codes as the contract defines them. Ints, because the AVM has no enums. */
export const JOB_OPEN = 0;
export const JOB_ASSIGNED = 1;
export const JOB_SUBMITTED = 2;
export const JOB_VALIDATED = 3;
export const JOB_DISPUTED = 4;
export const JOB_CANCELLED = 5;

export type OnchainJob = {
  jobId: number;
  /** The address that posted and funds the job. It keeps custody of the budget. */
  client: string;
  /** 0 until assigned. */
  serverAgentId: number;
  /** 0 means the client judges the result itself. */
  validatorAgentId: number;
  budgetMicro: number;
  budgetUsdc: number;
  /** sha256 of the specification, hex. Committed at post time so terms cannot move. */
  specHash: string;
  /** sha256 of the delivered result, hex — null until something is submitted. */
  resultHash: string | null;
  status: number;
  createdAt: number;
  updatedAt: number;
};

function toJob(raw: Uint8Array): OnchainJob {
  const f = decodeStruct(JOB, raw);
  const budgetMicro = num(f.budget_micro);
  const result = bytes(f.result_hash);
  return {
    jobId: num(f.job_id),
    client: str(f.client),
    serverAgentId: num(f.server_agent_id),
    validatorAgentId: num(f.validator_agent_id),
    budgetMicro,
    budgetUsdc: budgetMicro / 1e6,
    specHash: toHex(bytes(f.spec_hash)),
    resultHash: result.length ? toHex(result) : null,
    status: num(f.status),
    createdAt: num(f.created_at),
    updatedAt: num(f.updated_at),
  };
}

/** Every job on the board, newest id first — the order a job board is read in. */
export async function listJobs(limit = READ_LIMIT, signal?: AbortSignal): Promise<OnchainJob[]> {
  const appId = REGISTRIES.validation.appId;
  const prefixLen = BOX_PREFIX.jobs.length;
  const ordered = (await listBoxNames(appId, BOX_PREFIX.jobs, signal))
    .filter((n) => n.length === prefixLen + 8)
    .sort((a, b) => readUint64BE(b, prefixLen) - readUint64BE(a, prefixLen))
    .slice(0, limit);

  const values = await mapLimit(ordered, (n) => readBox(appId, n, signal));
  return values.filter(present).map(toJob);
}

export async function getJob(jobId: number, signal?: AbortSignal): Promise<OnchainJob | null> {
  const raw = await readBox(REGISTRIES.validation.appId, uint64Key(BOX_PREFIX.jobs, jobId), signal);
  return raw ? toJob(raw) : null;
}

/* ── registry-level facts ──────────────────────────────────────────────── */

type AppInfo = {
  params?: {
    creator?: string;
    "global-state"?: Array<{ key: string; value: { uint?: number; bytes?: string; type: number } }>;
  };
};

/**
 * The counters the contracts keep in global state, plus the creator.
 *
 * `agent_count` is the highest id ever issued, not the number of live boxes —
 * ids are never reused, so quoting it as "agents registered" would overstate
 * the moment anything is ever removed. It is shown for what it is.
 */
export async function getRegistryState(
  key: RegistryKey,
  counterKey: string,
  signal?: AbortSignal,
): Promise<{ appId: number; creator: string | null; counter: number | null }> {
  const appId = REGISTRIES[key].appId;
  const info = await get<AppInfo>(`${TESTNET_ALGOD}/v2/applications/${appId}`, signal);
  const encoded = Buffer.from(counterKey, "utf8").toString("base64");
  const entry = (info.params?.["global-state"] ?? []).find((g) => g.key === encoded);
  return {
    appId,
    creator: info.params?.creator ?? null,
    counter: entry?.value?.uint ?? null,
  };
}

/**
 * A read a page can survive losing, tagged with why it failed.
 *
 * There is a trap this exists to avoid. Asking algod for the boxes of an
 * application that does not exist returns `{"boxes": []}` with a 200 — an
 * empty registry and a missing registry are byte-identical on that endpoint.
 * Asking for the application itself returns 404. So a page must read the app
 * before it is entitled to say "deployed, and holding nothing".
 */
export async function tryRead<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

/** The round every figure on the page was true as of. */
export async function getTestnetRound(signal?: AbortSignal): Promise<number> {
  const status = await get<{ "last-round": number }>(`${TESTNET_ALGOD}/v2/status`, signal);
  return status["last-round"];
}
