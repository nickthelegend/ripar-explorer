/**
 * One definition per formatter and one definition per status colour, imported
 * everywhere. The moment `getStatusColor` exists in two files they drift, and
 * the same word ends up two different colours on the index and the detail page.
 */

import { SNAPSHOT, type AgentStatus, type EscrowState, type JobStatus, type TxKind, type VerificationState } from "./explorer-data";

const SNAPSHOT_MS = Date.parse(SNAPSHOT);

/* ── time ──────────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Relative time, measured against the dataset snapshot rather than the wall
 * clock. Against `Date.now()` this would render differently on the server and
 * the client and hydration would tear; it would also drift away from the data
 * it describes every day nobody reruns the capture.
 */
export function relTime(isoDate: string): string {
  const delta = SNAPSHOT_MS - Date.parse(isoDate);
  const future = delta < 0;
  const s = Math.abs(delta) / 1000;
  const unit =
    s < 60 ? [Math.round(s), "sec"] :
    s < 3600 ? [Math.round(s / 60), "min"] :
    s < 86400 ? [Math.round(s / 3600), "hr"] :
    s < 2592000 ? [Math.round(s / 86400), "day"] :
    [Math.round(s / 2592000), "mo"];
  const [n, label] = unit as [number, string];
  const plural = n === 1 ? "" : "s";
  return future ? `in ${n} ${label}${plural}` : `${n} ${label}${plural} ago`;
}

/**
 * Relative time against the wall clock, for chain data.
 *
 * `relTime` deliberately measures against the frozen dataset snapshot. Onchain
 * records have no snapshot — a block happened when it happened — so they need
 * the real clock. Only safe inside a `force-dynamic` server render: computed
 * during a static build it would be baked in, and computed on both sides of a
 * hydration boundary it would tear.
 */
export function liveAgo(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const s = Math.max(0, Math.round(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

/** Absolute UTC time. Lists get `relTime`, detail pages get this. */
export function absTime(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** `28 Jul`, for axis ticks where the year is already established by context. */
export function shortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function durationMin(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ── identifiers ───────────────────────────────────────────────────────── */

/** Algorand addresses are 58 characters; nobody reads the middle. */
export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (addr.startsWith("APP-")) return addr;
  return addr.length <= head + tail + 3 ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export const shortId = (id: string, n = 10) => (id.length <= n ? id : `${id.slice(0, n)}…`);

/* ── amounts ───────────────────────────────────────────────────────────── */

/**
 * USDC has six decimals. Small per-call prices need all of them; escrow totals
 * do not. Formatting by the token's own precision, never by a hardcoded 2.
 */
export function usdc(amount: number, opts: { compact?: boolean } = {}): string {
  const decimals = amount !== 0 && Math.abs(amount) < 1 ? Math.min(6, Math.max(2, -Math.floor(Math.log10(Math.abs(amount))) + 2)) : 2;
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: opts.compact ? 0 : decimals,
    maximumFractionDigits: decimals,
  });
}

export const algo = (microAlgo: number) => (microAlgo / 1e6).toFixed(4);

export const int = (n: number) => n.toLocaleString("en-US");

export function pct(fraction: number | null, digits = 0): string {
  if (fraction == null) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/* ── status vocabulary ─────────────────────────────────────────────────── */

/**
 * Tones map to a CSS custom property, never to a raw hex in a component. Every
 * status renders as a dot AND its label, so the state survives greyscale,
 * colour-blindness and a bad monitor.
 */
export type Tone = "ok" | "warn" | "bad" | "info" | "run" | "verify" | "idle";

export const TONE_VAR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  info: "var(--info)",
  run: "var(--accent)",
  verify: "var(--violet)",
  idle: "var(--neutral)",
};

export const AGENT_STATUS: Record<AgentStatus, { label: string; tone: Tone; hint: string }> = {
  online: { label: "Online", tone: "ok", hint: "Answering health probes and accepting bids." },
  degraded: { label: "Degraded", tone: "warn", hint: "Answering, but reporting partial capability." },
  offline: { label: "Offline", tone: "idle", hint: "Registered but not answering health probes." },
  suspended: { label: "Suspended", tone: "bad", hint: "Blocked from bidding by the registry." },
};

export const JOB_STATUS: Record<JobStatus, { label: string; tone: Tone; hint: string }> = {
  open: { label: "Open", tone: "info", hint: "Posted and accepting bids." },
  bidding: { label: "Bidding", tone: "warn", hint: "Bids received; the window is still open." },
  running: { label: "Running", tone: "run", hint: "Awarded and executing." },
  verifying: { label: "Verifying", tone: "verify", hint: "Result submitted, verification in progress." },
  verified: { label: "Verified", tone: "ok", hint: "Verification passed and escrow released." },
  failed: { label: "Failed", tone: "bad", hint: "Not delivered or not accepted; escrow refunded." },
  cancelled: { label: "Cancelled", tone: "idle", hint: "Withdrawn by the requester before award." },
  expired: { label: "Expired", tone: "idle", hint: "Bidding window closed with no award." },
};

export const ESCROW_STATE: Record<EscrowState, { label: string; tone: Tone; hint: string }> = {
  unfunded: { label: "Unfunded", tone: "idle", hint: "No funds committed; the job cannot be bid on." },
  funded: { label: "Funded", tone: "info", hint: "Budget committed and held by the escrow app." },
  locked: { label: "Locked", tone: "warn", hint: "Held against an awarded agent until the job settles." },
  released: { label: "Released", tone: "ok", hint: "Paid out to the agent, net of protocol fee." },
  refunded: { label: "Refunded", tone: "verify", hint: "Returned to the requester in full." },
};

export const VERIFICATION_STATE: Record<VerificationState, { label: string; tone: Tone }> = {
  "not-run": { label: "Not run", tone: "idle" },
  pending: { label: "Pending", tone: "warn" },
  passed: { label: "Passed", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

export const TX_KIND: Record<TxKind, { label: string; tone: Tone; hint: string }> = {
  "escrow-fund": { label: "Escrow fund", tone: "info", hint: "Requester commits the full job budget to the escrow app." },
  "escrow-release": {
    label: "Escrow release",
    tone: "ok",
    hint: "Escrow pays the winning agent its agreed bid, less the 1.5% protocol fee withheld in the same transaction.",
  },
  "escrow-refund": {
    label: "Escrow refund",
    tone: "verify",
    hint: "Escrow returns budget to the requester — the unspent remainder on a verified job, or the whole budget when the job failed.",
  },
};

export const TX_STATUS: Record<"confirmed" | "failed", { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
};

/* ── onchain status vocabulary ─────────────────────────────────────────── */

/**
 * The ValidationRegistry's job states. Onchain these are bare uint64s — the AVM
 * has no enums — so the mapping from 3 to "Validated" lives here with every
 * other status vocabulary rather than inline in a table cell.
 *
 * The names and codes are the contract's own, from `validation_registry.py`.
 */
export const CHAIN_JOB_STATUS: Record<number, { label: string; tone: Tone; hint: string }> = {
  0: { label: "Open", tone: "info", hint: "Posted with a budget and a spec hash. No agent assigned yet." },
  1: { label: "Assigned", tone: "run", hint: "The client picked an agent. Only that agent may submit a result." },
  2: { label: "Submitted", tone: "verify", hint: "A result hash is committed onchain and is waiting to be judged." },
  3: { label: "Validated", tone: "ok", hint: "The validator judged the result as passing. Terminal." },
  4: { label: "Disputed", tone: "bad", hint: "The validator judged the result as failing. Terminal, and kept on the record." },
  5: { label: "Cancelled", tone: "idle", hint: "Withdrawn by the client while still open. An assigned job cannot be cancelled." },
};

/** An unrecognised code is reported as itself, never mapped to a nearby state. */
export function chainJobStatus(code: number): { label: string; tone: Tone; hint: string } {
  return (
    CHAIN_JOB_STATUS[code] ?? {
      label: `Unknown (${code})`,
      tone: "idle",
      hint: "This status code is not one the deployed contract defines. Shown raw rather than guessed at.",
    }
  );
}
