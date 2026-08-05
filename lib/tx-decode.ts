/**
 * One transaction, turned back into what it actually did.
 *
 * An Algorand transaction on its own is a selector, some base64 arguments and a
 * list of boxes — true, complete and unreadable. This file resolves the three
 * things that make it legible again, and refuses to guess at any of them:
 *
 *   1. WHICH METHOD. `application-args[0]` is the first four bytes of
 *      sha512/256 over the method's exact signature string. The table below
 *      holds signatures, never transcribed selector hex — each one is derived
 *      through `ABIMethod.fromSignature`, so a signature that does not match the
 *      deployed contract produces no match rather than a confident wrong label.
 *
 *   2. WHAT THE ARGUMENTS WERE. Decoded with `ABIType` against the argument
 *      types in that same signature. Transaction-typed arguments (`axfer`) are
 *      NOT in `application-args` — they are matched by position in the group —
 *      so they are reported as the group member they refer to.
 *
 *   3. WHAT CHANGED. The indexer returns the global-state delta and the inner
 *      transactions the app submitted. Box CONTENTS are not in a transaction at
 *      all, so a box write shows as the box that was referenced and nothing
 *      more; claiming to show the value would be inventing it.
 *
 * An unrecognised transaction is reported as its type and nothing else. There
 * is no "probably a settlement" here.
 */

import { ABIMethod, ABIType, type ABIValue } from "algosdk";
import { REGISTRIES, SETTLEMENT_ASSET, TESTNET_INDEXER } from "./registries";

/* ── the methods these three apps actually expose ──────────────────────────
 *
 * Every signature below was checked against the DEPLOYED approval program by
 * searching it for the derived selector — the local ARC-56 artifacts are older
 * than the deployment and list neither the escrow methods nor the real return
 * type of accept_feedback, so they are not the source used here.
 */

type MethodSpec = { signature: string; summary: string };

const IDENTITY_METHODS: MethodSpec[] = [
  { signature: "new_agent(string)uint64", summary: "Registered the sender as a new agent under a domain." },
  { signature: "update_agent(uint64,string)bool", summary: "Moved an agent to a new domain." },
  { signature: "rotate_address(uint64,address)bool", summary: "Moved an identity to a new controlling address." },
  { signature: "get_agent(uint64)(uint64,string,address,uint64,uint64)", summary: "Read one agent record." },
  { signature: "resolve_by_domain(string)uint64", summary: "Resolved a domain to an agent id." },
  { signature: "resolve_by_address(address)uint64", summary: "Resolved an address to an agent id." },
  { signature: "agent_address(uint64)address", summary: "Resolved an agent id to its controlling address." },
  { signature: "total_agents()uint64", summary: "Read the agent counter." },
];

const REPUTATION_METHODS: MethodSpec[] = [
  {
    signature: "accept_feedback(axfer,uint64,uint64)uint64",
    summary:
      "Credited a server agent for one settled payment. The amount is read off the transfer sitting in this same group, not off an argument.",
  },
  {
    signature: "record_validation(uint64,bool)bool",
    summary:
      "Wrote a validator's verdict onto an agent's score. Callable only by the ValidationRegistry, by inner call.",
  },
  { signature: "bootstrap(uint64,uint64)bool", summary: "Fixed the Identity Registry and the settlement asset. Creator only." },
  { signature: "set_validation_app(uint64)bool", summary: "Named the ValidationRegistry allowed to write verdicts." },
  { signature: "get_score(uint64)(uint64,uint64,uint64,uint64,uint64,uint64,uint64)", summary: "Read one agent's score." },
];

const VALIDATION_METHODS: MethodSpec[] = [
  { signature: "post_job(byte[],uint64,uint64)uint64", summary: "Opened a job, committing the spec by hash." },
  { signature: "assign_job(uint64,uint64)bool", summary: "Gave a job to an agent. Client only, and only while open." },
  { signature: "submit_result(uint64,byte[])bool", summary: "The assignee committed its result by hash." },
  {
    signature: "validation_response(uint64,bool)uint64",
    summary: "Judged a submitted result. Terminal either way, and the verdict is written to the agent's score.",
  },
  { signature: "set_validator(uint64,uint64)bool", summary: "Named or changed who judges the job, while it was still open." },
  { signature: "cancel_job(uint64)bool", summary: "Withdrew an open job." },
  {
    signature: "fund_job(axfer,uint64)uint64",
    summary: "Moved a budget into escrow. The amount comes off the transfer in this group, not off an argument.",
  },
  { signature: "release_escrow(uint64)uint64", summary: "Paid the escrow to the assignee after a passing verdict." },
  { signature: "refund_escrow(uint64)uint64", summary: "Returned the escrow to the client." },
  { signature: "get_escrow(uint64)uint64", summary: "Read what is escrowed for a job." },
  { signature: "bootstrap(uint64,uint64,uint64,uint64)bool", summary: "Set the registries, the escrow asset and the dispute window." },
  { signature: "opt_in_asset()bool", summary: "Opted the app's own account into the escrow asset, so it can hold one." },
  { signature: "total_jobs()uint64", summary: "Read the job counter." },
];

export type KnownApp = { appId: number; name: string; methods: MethodSpec[] };

const APPS: KnownApp[] = [
  { appId: REGISTRIES.identity.appId, name: REGISTRIES.identity.name, methods: IDENTITY_METHODS },
  { appId: REGISTRIES.reputation.appId, name: REGISTRIES.reputation.name, methods: REPUTATION_METHODS },
  { appId: REGISTRIES.validation.appId, name: REGISTRIES.validation.name, methods: VALIDATION_METHODS },
];

/** signature -> selector hex, derived once. Never transcribed. */
const SELECTORS = new Map<string, string>();
for (const app of APPS) {
  for (const m of app.methods) {
    SELECTORS.set(
      m.signature,
      Buffer.from(ABIMethod.fromSignature(m.signature).getSelector()).toString("hex")
    );
  }
}

/* ── indexer shapes ────────────────────────────────────────────────────── */

export type IndexerTxn = {
  id?: string;
  group?: string;
  sender?: string;
  fee?: number;
  note?: string;
  "tx-type"?: string;
  "confirmed-round"?: number;
  "round-time"?: number;
  "intra-round-offset"?: number;
  "created-application-index"?: number;
  "asset-transfer-transaction"?: {
    "asset-id"?: number;
    amount?: number;
    receiver?: string;
    "close-to"?: string;
  };
  "payment-transaction"?: { amount?: number; receiver?: string };
  "application-transaction"?: {
    "application-id"?: number;
    "application-args"?: string[];
    "box-references"?: Array<{ app?: number; name?: string }>;
    "foreign-apps"?: number[];
    "foreign-assets"?: number[];
    accounts?: string[];
    "on-completion"?: string;
  };
  "global-state-delta"?: Array<{ key: string; value: { action?: number; uint?: number; bytes?: string } }>;
  "inner-txns"?: IndexerTxn[];
  logs?: string[];
};

export class TxReadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "TxReadError";
  }
}

/**
 * Which chain a transaction id was found on.
 *
 * The registries are TestNet-only, but x402 settlements happen on MainNet, and
 * both are things someone might paste in. So the lookup tries TestNet first and
 * falls back to MainNet, and every consumer is handed the answer along with the
 * transaction — because APPLICATION IDS ARE NETWORK-SCOPED. App 768633998 on
 * MainNet is somebody else's contract entirely, and labelling it
 * "IdentityRegistry" because the number matches would be the single worst
 * mistake this decoder could make.
 */
export type TxNetwork = "testnet" | "mainnet";

export const MAINNET_INDEXER = "https://mainnet-idx.algonode.cloud";

const INDEXERS: Record<TxNetwork, string> = {
  testnet: TESTNET_INDEXER,
  mainnet: MAINNET_INDEXER,
};

export type FoundTxn = { txn: IndexerTxn; network: TxNetwork };

/** One transaction, from whichever public indexer has it, or null if neither. */
export async function fetchTransaction(txId: string, signal?: AbortSignal): Promise<FoundTxn | null> {
  let lastError: TxReadError | null = null;

  for (const network of ["testnet", "mainnet"] as const) {
    const url = `${INDEXERS[network]}/v2/transactions/${encodeURIComponent(txId)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal, cache: "no-store" });
    } catch (e) {
      lastError = new TxReadError(`Network error reaching ${new URL(url).host}: ${(e as Error).message}`, url);
      continue;
    }
    if (res.status === 404) continue;
    if (!res.ok) {
      lastError = new TxReadError(`${res.status} ${res.statusText}`.trim(), url, res.status);
      continue;
    }
    const body = (await res.json()) as { transaction?: IndexerTxn };
    if (body.transaction) return { txn: body.transaction, network };
  }

  // Two clean 404s mean the id is on neither chain, which is an answer. An
  // error on either means we do not know, and those must not look the same.
  if (lastError) throw lastError;
  return null;
}

/** The other members of a transaction's group, in ledger order. */
export async function fetchGroup(
  groupId: string,
  round: number,
  network: TxNetwork,
  signal?: AbortSignal
): Promise<IndexerTxn[]> {
  const url = `${INDEXERS[network]}/v2/transactions?round=${round}&limit=200`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new TxReadError(`${res.status} ${res.statusText}`.trim(), url, res.status);
  const body = (await res.json()) as { transactions?: IndexerTxn[] };
  return (body.transactions ?? [])
    .filter((t) => t.group === groupId)
    .sort((a, b) => (a["intra-round-offset"] ?? 0) - (b["intra-round-offset"] ?? 0));
}

/* ── decoding ──────────────────────────────────────────────────────────── */

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const hex = (b: ArrayLike<number>) => Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");

export function decodeNote(note?: string): string | null {
  if (!note) return null;
  try {
    const text = Buffer.from(note, "base64").toString("utf8");
    // Notes are arbitrary bytes; surface them only when they are readable text.
    return /^[\x20-\x7e\s]*$/.test(text) && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export type DecodedArg = {
  name: string;
  type: string;
  /** Already rendered. A `byte[]` becomes hex, an address stays base32. */
  value: string;
  /** Where the value came from, when it is not simply the argument. */
  note?: string;
};

export type DecodedAppCall = {
  appId: number;
  /** null when the call is to an app this explorer does not know. */
  registry: string | null;
  /** null when the selector matches no method this explorer knows. */
  signature: string | null;
  method: string | null;
  summary: string | null;
  selectorHex: string;
  args: DecodedArg[];
  boxes: string[];
  foreignApps: number[];
  foreignAssets: number[];
  accounts: string[];
  onCompletion: string;
  globalDelta: Array<{ key: string; value: string }>;
  /** Inner transactions the app submitted, flattened one level. */
  inner: Array<{ kind: string; detail: string }>;
  /** The ABI return value, when the app logged one. ARC-4 prefixes it with
   *  the four bytes 151f7c75, which is how it is told apart from a plain log. */
  returned: string | null;
};

const ARC4_RETURN_PREFIX = "151f7c75";

/** Renders one decoded ABI value without pretending bytes are text. */
function render(type: string, value: ABIValue): string {
  if (type === "address") return String(value);
  if (type === "byte[]" || type.startsWith("byte[")) {
    const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value as number[]);
    return bytes.length ? hex(bytes) : "(empty)";
  }
  if (type === "bool") return value ? "true" : "false";
  if (type === "string") return String(value);
  return String(value);
}

export function decodeAppCall(txn: IndexerTxn, network: TxNetwork = "testnet"): DecodedAppCall | null {
  const at = txn["application-transaction"];
  if (!at) return null;

  const appId = Number(at["application-id"] ?? 0) || Number(txn["created-application-index"] ?? 0);
  // Only on TestNet. Application ids are per-network, so the same number on
  // MainNet is an unrelated contract and decoding its arguments against these
  // signatures would produce confident nonsense.
  const known = network === "testnet" ? (APPS.find((a) => a.appId === appId) ?? null) : null;
  const rawArgs = at["application-args"] ?? [];
  const selectorHex = rawArgs.length ? hex(b64(rawArgs[0])) : "";

  let signature: string | null = null;
  let summary: string | null = null;
  if (known && selectorHex) {
    const match = known.methods.find((m) => SELECTORS.get(m.signature) === selectorHex);
    if (match) {
      signature = match.signature;
      summary = match.summary;
    }
  }

  const args: DecodedArg[] = [];
  if (signature) {
    const method = ABIMethod.fromSignature(signature);
    // appArgs after the selector line up with the NON-transaction arguments
    // only. A `axfer` argument is matched by its position in the group.
    let cursor = 1;
    for (const arg of method.args) {
      const type = String(arg.type);
      if (type === "axfer" || type === "pay" || type === "appl" || type === "txn") {
        args.push({
          name: arg.name ?? type,
          type,
          value: "the transaction immediately before this one in the group",
          note: "A transaction argument is not encoded into application-args — it is matched by position, which is what makes the amount impossible to misreport.",
        });
        continue;
      }
      const encoded = rawArgs[cursor];
      cursor += 1;
      if (encoded == null) {
        args.push({ name: arg.name ?? type, type, value: "(missing)" });
        continue;
      }
      try {
        args.push({
          name: arg.name ?? type,
          type,
          value: render(type, ABIType.from(type).decode(b64(encoded))),
        });
      } catch {
        // A decode that fails is reported as raw bytes rather than guessed at.
        args.push({ name: arg.name ?? type, type, value: `0x${hex(b64(encoded))}`, note: "Could not decode against the declared type; shown raw." });
      }
    }
  } else {
    for (let i = 1; i < rawArgs.length; i += 1) {
      args.push({ name: `arg ${i}`, type: "bytes", value: `0x${hex(b64(rawArgs[i]))}` });
    }
  }

  const boxes = (at["box-references"] ?? []).map((b) => {
    const name = b.name ? b64(b.name) : new Uint8Array();
    const prefix = Buffer.from(name.slice(0, 3)).toString("utf8");
    const tail = name.slice(3);
    const body =
      tail.length === 8
        ? `${prefix}${new DataView(tail.buffer, tail.byteOffset, 8).getBigUint64(0, false)}`
        : prefix === "dm_"
          ? `${prefix}${Buffer.from(tail).toString("utf8")}`
          : `${prefix}0x${hex(tail)}`;
    // `app: 0` means the box belongs to the app being called.
    return b.app ? `${body}@${b.app}` : body;
  });

  const globalDelta = (txn["global-state-delta"] ?? []).map((d) => ({
    key: Buffer.from(d.key, "base64").toString("utf8"),
    value:
      d.value?.uint != null
        ? String(d.value.uint)
        : d.value?.bytes
          ? `0x${hex(b64(d.value.bytes))}`
          : d.value?.action === 3
            ? "deleted"
            : "0",
  }));

  const inner = (txn["inner-txns"] ?? []).map((t) => {
    if (t["tx-type"] === "axfer") {
      const x = t["asset-transfer-transaction"];
      return {
        kind: "asset transfer",
        detail: `${Number(x?.amount ?? 0)} base units of asset ${x?.["asset-id"] ?? "?"} to ${x?.receiver ?? "?"}`,
      };
    }
    if (t["tx-type"] === "appl") {
      const inner = decodeAppCall(t, network);
      return {
        kind: "application call",
        detail: inner
          ? `${inner.signature ?? `selector 0x${inner.selectorHex}`} on app ${inner.appId}`
          : "application call",
      };
    }
    if (t["tx-type"] === "pay") {
      const p = t["payment-transaction"];
      return { kind: "payment", detail: `${Number(p?.amount ?? 0)} µALGO to ${p?.receiver ?? "?"}` };
    }
    return { kind: t["tx-type"] ?? "unknown", detail: "" };
  });

  let returned: string | null = null;
  for (const log of txn.logs ?? []) {
    const bytes = b64(log);
    if (bytes.length > 4 && hex(bytes.slice(0, 4)) === ARC4_RETURN_PREFIX && signature) {
      const retType = signature.slice(signature.lastIndexOf(")") + 1);
      if (retType && retType !== "void") {
        try {
          returned = render(retType, ABIType.from(retType).decode(bytes.slice(4)));
        } catch {
          returned = `0x${hex(bytes.slice(4))}`;
        }
      }
    }
  }

  return {
    appId,
    registry: known?.name ?? null,
    signature,
    method: signature ? signature.slice(0, signature.indexOf("(")) : null,
    summary,
    selectorHex,
    args,
    boxes,
    foreignApps: at["foreign-apps"] ?? [],
    foreignAssets: at["foreign-assets"] ?? [],
    accounts: at.accounts ?? [],
    onCompletion: at["on-completion"] ?? "noop",
    globalDelta,
    inner,
    returned,
  };
}

/* ── x402 ──────────────────────────────────────────────────────────────── */

/**
 * An x402 settlement on Algorand is a two-transaction atomic group:
 *
 *   pay    from the facilitator's fee payer, note `x402-fee-payer-<nonce>`,
 *          carrying the fee for the whole group
 *   axfer  the stablecoin, from the payer to the endpoint's address, note
 *          `x402-payment-v2-<nonce>`, and fee 0 — sponsored by the leg above
 *
 * The shared nonce is what ties them together, and a transfer is only called a
 * settlement here when BOTH notes are present. A bare transfer of the same
 * asset between the same parties is a transfer; calling it an x402 settlement
 * because it looks like one is exactly the kind of guess this page must not
 * make.
 */
export const X402_PAYMENT_NOTE = "x402-payment-v2-";
export const X402_FEE_NOTE = "x402-fee-payer-";

export type X402Settlement = {
  nonce: string;
  payer: string;
  payee: string;
  amountMicro: number;
  assetId: number;
  /** µALGO the facilitator covered so the payer needed no ALGO at all. */
  sponsoredFee: number;
  feePayer: string;
};

export function detectX402(txn: IndexerTxn, group: IndexerTxn[]): X402Settlement | null {
  const transfer = txn["tx-type"] === "axfer" ? txn : group.find((t) => t["tx-type"] === "axfer");
  if (!transfer) return null;
  const note = decodeNote(transfer.note);
  if (!note?.startsWith(X402_PAYMENT_NOTE)) return null;

  const feeLeg = group.find((t) => decodeNote(t.note)?.startsWith(X402_FEE_NOTE));
  if (!feeLeg) return null;

  const x = transfer["asset-transfer-transaction"];
  return {
    nonce: note.slice(X402_PAYMENT_NOTE.length),
    payer: transfer.sender ?? "",
    payee: x?.receiver ?? "",
    amountMicro: Number(x?.amount ?? 0),
    assetId: Number(x?.["asset-id"] ?? 0),
    sponsoredFee: Number(feeLeg.fee ?? 0),
    feePayer: feeLeg.sender ?? "",
  };
}

export type AssetMove = {
  amountMicro: number;
  units: number;
  receiver: string;
  sender: string;
  assetId: number;
  /** True only when the asset is the one the TestNet registries settle in. */
  isSettlementAsset: boolean;
};

/** Any asset transfer, with the settlement asset called out by name. */
export function assetTransfer(txn: IndexerTxn, network: TxNetwork = "testnet"): AssetMove | null {
  const x = txn["asset-transfer-transaction"];
  if (!x) return null;
  const assetId = Number(x["asset-id"] ?? 0);
  const isSettlementAsset = network === "testnet" && assetId === SETTLEMENT_ASSET.id;
  const amountMicro = Number(x.amount ?? 0);
  return {
    amountMicro,
    // Six decimals holds for the settlement asset and for USDC on either
    // network. Anything else is reported in base units by the caller rather
    // than divided by a figure nobody looked up.
    units: amountMicro / 10 ** SETTLEMENT_ASSET.decimals,
    receiver: x.receiver ?? "",
    sender: txn.sender ?? "",
    assetId,
    isSettlementAsset,
  };
}

/** The asset moved by some OTHER member of the group — how an app call that
 *  moves nothing itself still sits next to money, as `fund_job` does. */
export function groupAssetMove(txn: IndexerTxn, group: IndexerTxn[], network: TxNetwork): AssetMove | null {
  for (const t of group) {
    if (t.id === txn.id) continue;
    const move = assetTransfer(t, network);
    if (move && move.amountMicro > 0) return move;
  }
  return null;
}

/** Is this transaction one of ours at all? Used to say so plainly when not. */
export function touchesRipar(txn: IndexerTxn, group: IndexerTxn[], network: TxNetwork = "testnet"): boolean {
  if (network !== "testnet") return false;
  const all = [txn, ...group];
  return all.some((t) => {
    const appId = Number(t["application-transaction"]?.["application-id"] ?? 0);
    if (APPS.some((a) => a.appId === appId)) return true;
    return Number(t["asset-transfer-transaction"]?.["asset-id"] ?? 0) === SETTLEMENT_ASSET.id;
  });
}
