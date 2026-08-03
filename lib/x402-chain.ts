/**
 * Real x402 settlements, read from Algorand MainNet.
 *
 * Everything else in this explorer is a sample dataset. This file is not: it
 * indexes actual settlements that other people's agents are making right now.
 *
 * How they are identified. An x402 payment on Algorand settles as a 2-transaction
 * atomic group:
 *
 *   1. `pay`   from the facilitator's fee payer, note `x402-fee-payer-<nonce>`,
 *              carrying the fee for the whole group (2000 µALGO)
 *   2. `axfer` USDC from the payer to the endpoint's address, note
 *              `x402-payment-v2-<nonce>`, and fee 0 — sponsored by leg 1
 *
 * The shared `<nonce>` ties the two legs together. Because the fee payer signs
 * leg 1 of every settlement it sponsors, walking that one account's history
 * enumerates the settlements without needing an archival full-node scan.
 */

const INDEXER = "https://mainnet-idx.algonode.cloud";
const ALGOD = "https://mainnet-api.algonode.cloud";

/** GoPlausible's fee payer, as published by its own /supported endpoint. */
export const FACILITATOR_FEE_PAYER =
  "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA";

export const USDC_MAINNET = 31_566_704;

const PAYMENT_NOTE = "x402-payment-v2-";
const FEE_NOTE = "x402-fee-payer-";

export type RealSettlement = {
  /** The axfer's own id — this resolves on any Algorand explorer. */
  txId: string;
  groupId: string;
  round: number;
  timestamp: number;
  /** Who paid. */
  from: string;
  /** The endpoint's payout address. */
  to: string;
  amountUsdc: number;
  /** Shared between the two legs of the group. */
  nonce: string | null;
  /** µALGO the facilitator covered so the payer needed no ALGO. */
  sponsoredFee: number;
};

type IdxTxn = {
  id?: string;
  group?: string;
  "confirmed-round"?: number;
  "round-time"?: number;
  "tx-type"?: string;
  sender?: string;
  fee?: number;
  note?: string;
  "asset-transfer-transaction"?: { "asset-id"?: number; amount?: number; receiver?: string };
};

function decodeNote(b64?: string): string | null {
  if (!b64) return null;
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  // no-store, or Next caches these during a build and the "live" feed freezes.
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

/**
 * Recent real settlements, newest first.
 *
 * Two round-trips per settlement would be slow, so this walks the fee payer's
 * history to find candidate groups and then reads each group's round once,
 * de-duplicating rounds that carry several settlements.
 */
export async function fetchRealSettlements(limit = 20): Promise<RealSettlement[]> {
  // Over-fetch: only the fee-payer legs are here, and some groups may be
  // unrelated sponsorships.
  const feeLegs = await json<{ transactions: IdxTxn[] }>(
    `${INDEXER}/v2/accounts/${FACILITATOR_FEE_PAYER}/transactions?limit=${Math.min(limit * 3, 200)}`
  );

  const wanted = (feeLegs.transactions ?? []).filter((t) => {
    const note = decodeNote(t.note);
    return t.group && note?.startsWith(FEE_NOTE);
  });

  // One read per distinct round rather than per transaction.
  const rounds = [...new Set(wanted.map((t) => t["confirmed-round"]).filter(Boolean))] as number[];
  const byRound = new Map<number, IdxTxn[]>();

  await Promise.all(
    rounds.slice(0, limit).map(async (r) => {
      try {
        const blk = await json<{ transactions?: IdxTxn[] }>(`${INDEXER}/v2/blocks/${r}`);
        byRound.set(r, blk.transactions ?? []);
      } catch {
        // A single unreadable round must not take out the whole feed.
        byRound.set(r, []);
      }
    })
  );

  const out: RealSettlement[] = [];
  const seen = new Set<string>();

  for (const feeLeg of wanted) {
    const round = feeLeg["confirmed-round"];
    const gid = feeLeg.group;
    if (!round || !gid || seen.has(gid)) continue;

    const group = (byRound.get(round) ?? []).filter((t) => t.group === gid);
    const transfer = group.find((t) => {
      const note = decodeNote(t.note);
      return (
        t["tx-type"] === "axfer" &&
        t["asset-transfer-transaction"]?.["asset-id"] === USDC_MAINNET &&
        note?.startsWith(PAYMENT_NOTE)
      );
    });
    if (!transfer) continue;

    const x = transfer["asset-transfer-transaction"]!;
    const note = decodeNote(transfer.note) ?? "";
    seen.add(gid);
    out.push({
      txId: transfer.id ?? "",
      groupId: gid,
      round,
      timestamp: (transfer["round-time"] ?? feeLeg["round-time"] ?? 0) * 1000,
      from: transfer.sender ?? "",
      to: x.receiver ?? "",
      amountUsdc: (x.amount ?? 0) / 1e6,
      nonce: note.slice(PAYMENT_NOTE.length) || null,
      sponsoredFee: feeLeg.fee ?? 0,
    });
  }

  return out.sort((a, b) => b.round - a.round).slice(0, limit);
}

export type ChainPulse = {
  round: number;
  /** Seconds between the last two blocks, measured rather than quoted. */
  blockTime: number | null;
};

export async function fetchChainPulse(): Promise<ChainPulse> {
  const status = await json<{ "last-round": number }>(`${ALGOD}/v2/status`);
  const head = status["last-round"];
  try {
    const [a, b] = await Promise.all([
      json<{ block: { ts: number } }>(`${ALGOD}/v2/blocks/${head - 5}?format=json`),
      json<{ block: { ts: number } }>(`${ALGOD}/v2/blocks/${head - 1}?format=json`),
    ]);
    return { round: head, blockTime: (b.block.ts - a.block.ts) / 4 };
  } catch {
    return { round: head, blockTime: null };
  }
}

/** Totals over whatever slice we can see. Explicitly a sample of recent
 *  activity, not a lifetime total — saying otherwise would be a fabrication. */
export function summarise(rows: RealSettlement[]) {
  const volume = rows.reduce((s, r) => s + r.amountUsdc, 0);
  const payers = new Set(rows.map((r) => r.from)).size;
  const payees = new Set(rows.map((r) => r.to)).size;
  const feesCovered = rows.reduce((s, r) => s + r.sponsoredFee, 0) / 1e6;
  const span =
    rows.length > 1 ? (rows[0].timestamp - rows[rows.length - 1].timestamp) / 1000 : 0;
  return { count: rows.length, volume, payers, payees, feesCovered, spanSeconds: span };
}
