import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  REGISTRIES,
  SETTLEMENT_ASSET,
  TESTNET_INDEXER,
  loraAsset,
  loraTx,
  peraAddress,
  peraApp,
  peraBlock,
  peraTx,
} from "@/lib/erc8004";
import {
  MAINNET_INDEXER,
  assetTransfer,
  decodeAppCall,
  decodeNote,
  detectX402,
  fetchGroup,
  fetchTransaction,
  groupAssetMove,
  touchesRipar,
  type FoundTxn,
  type TxNetwork,
} from "@/lib/tx-decode";
import { absTime, int, liveAgo, shortAddr, usdc } from "@/lib/format";
import { EmptyState, Field, Panel, Stat, Status } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { ChainReadError, Out, PlainTh, RealChainBadge, TestNetBadge } from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Transaction",
  description:
    "One Algorand TestNet transaction, decoded into what it actually did — the ABI method it called, the arguments it carried, the boxes it wrote and the money it moved. Read from the public indexer.",
};

// A transaction is immutable, but which round is head is not, and the group
// read depends on it. Rendered per request rather than prerendered.
export const dynamic = "force-dynamic";

const units = (micro: number) => micro / 10 ** SETTLEMENT_ASSET.decimals;

/**
 * What to call an asset id.
 *
 * The registries settle in rUSDC, which is minted for that deployment. MainNet
 * x402 settles in the real USDC. Printing "rUSDC" over a MainNet USDC amount —
 * which this page did until it started reading both chains — is a small label
 * with a large lie in it, so the symbol is looked up rather than assumed.
 */
const ASSET_NAMES: Record<number, string> = {
  [SETTLEMENT_ASSET.id]: SETTLEMENT_ASSET.unitName,
  31_566_704: "USDC",
  10_458_941: "USDC",
};
const assetName = (id: number) => ASSET_NAMES[id] ?? `asset ${id}`;

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const txId = decodeURIComponent(id).trim().toUpperCase();

  // 52 unpadded base32 characters is the whole shape of a transaction id. A
  // lookup on anything else is a 400 from the indexer dressed as a 404 here.
  if (!/^[A-Z2-7]{52}$/.test(txId)) {
    return (
      <Shell txId={txId} network={null}>
        <ChainReadError
          what="that transaction id"
          message={`“${txId}” is not an Algorand transaction id. Ids are 52 characters of unpadded base32 — A–Z and 2–7 — over the 32-byte digest.`}
        />
      </Shell>
    );
  }

  let found: FoundTxn | null;
  try {
    found = await fetchTransaction(txId);
  } catch (e) {
    return (
      <Shell txId={txId} network={null}>
        <ChainReadError what="the public indexers" message={(e as Error).message} />
      </Shell>
    );
  }
  if (!found) notFound();

  const { txn, network } = found;
  const indexer = network === "testnet" ? TESTNET_INDEXER : MAINNET_INDEXER;
  const round = Number(txn["confirmed-round"] ?? 0);
  const group = txn.group && round ? await fetchGroup(txn.group, round, network).catch(() => []) : [];
  const others = group.filter((t) => t.id !== txn.id);

  const call = decodeAppCall(txn, network);
  const x402 = detectX402(txn, group);
  const transfer = assetTransfer(txn, network);
  const nearbyMove = call ? groupAssetMove(txn, group, network) : null;
  const note = decodeNote(txn.note);
  const ours = touchesRipar(txn, group, network);

  return (
    <Shell txId={txId} network={network}>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="What this was"
          value={
            call?.method
              ? call.method
              : x402
                ? "x402 settlement"
                : transfer
                  ? "asset transfer"
                  : (txn["tx-type"] ?? "unknown")
          }
          sub={
            call?.registry
              ? `an ABI call on the ${call.registry}`
              : x402
                ? `a sponsored, two-leg payment group in ${assetName(x402.assetId)}`
                : transfer?.isSettlementAsset
                  ? `${SETTLEMENT_ASSET.unitName}, the asset the registries settle in`
                  : transfer
                    ? `asset ${transfer.assetId}`
                    : ours
                      ? "in a group that touches Ripar, but not itself a Ripar call"
                      : `not a Ripar transaction — decoded only as far as the ${network === "mainnet" ? "MainNet" : "TestNet"} ledger describes it`
          }
        />
        <Stat
          label="Moved"
          value={
            x402
              ? usdc(units(x402.amountMicro))
              : transfer && transfer.amountMicro > 0
                ? usdc(transfer.units)
                : call?.inner.some((i) => i.kind === "asset transfer")
                  ? "see below"
                  : nearbyMove
                    ? usdc(nearbyMove.units)
                    : "nothing"
          }
          unit={
            x402
              ? assetName(x402.assetId)
              : transfer && transfer.amountMicro > 0
                ? assetName(transfer.assetId)
                : nearbyMove
                  ? assetName(nearbyMove.assetId)
                  : undefined
          }
          sub={
            x402 || (transfer && transfer.amountMicro > 0)
              ? "read off the transfer itself, in base units, divided by the asset's own six decimals"
              : call?.inner.some((i) => i.kind === "asset transfer")
                ? "the app submitted an inner transfer — the amounts are listed below"
                : nearbyMove
                  ? `this call moves nothing itself — the transfer is another member of its group, which is exactly how fund_job reads an amount it cannot be lied to about`
                  : "this transaction changed a record, not a balance"
          }
        />
        <Stat label="Round" value={round ? int(round) : "—"} sub={txn["round-time"] ? liveAgo(txn["round-time"]) : "not confirmed"} />
        <Stat
          label="Fee paid"
          value={((txn.fee ?? 0) / 1e6).toFixed(4)}
          unit="ALGO"
          sub={
            x402
              ? `the payer paid none of it — ${(x402.sponsoredFee / 1e6).toFixed(4)} ALGO came from the facilitator's fee payer`
              : (call?.inner.length ?? 0) > 0
                ? `covers this call and its ${call!.inner.length} inner transaction${call!.inner.length === 1 ? "" : "s"}, which are submitted with a fee of 0`
                : "the network's minimum for a single transaction"
          }
        />
      </div>

      {call && (
        <Panel
          className="mt-5"
          title="What the call did"
          note={call.signature ? `${call.signature} · selector 0x${call.selectorHex}` : `selector 0x${call.selectorHex}`}
        >
          <div className="px-4 py-4">
            {call.registry ? (
              <p className="text-[13.5px] leading-relaxed">
                <strong>{call.registry}</strong>, application{" "}
                <Out href={peraApp(call.appId)}>{call.appId}</Out>.{" "}
                {call.summary ?? (
                  <>
                    The selector <span className="font-mono text-[12px]">0x{call.selectorHex}</span> matches no
                    method this explorer knows about on that app. It is shown raw rather than mapped to a
                    nearby one.
                  </>
                )}
              </p>
            ) : (
              <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                An application call to app <Out href={peraApp(call.appId)}>{call.appId}</Out>, which is not one
                of Ripar&rsquo;s three registries. The arguments below are shown as raw bytes: without the
                app&rsquo;s ABI there is nothing honest to decode them against.
              </p>
            )}

            {call.args.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="tbl w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <PlainTh width={190}>Argument</PlainTh>
                      <PlainTh width={110}>Type</PlainTh>
                      <PlainTh>Value</PlainTh>
                    </tr>
                  </thead>
                  <tbody>
                    {call.args.map((a, i) => (
                      <tr key={`${a.name}-${i}`}>
                        <td className="font-medium">{a.name}</td>
                        <td className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                          {a.type}
                        </td>
                        <td>
                          <span className="break-all font-mono text-[12px]">{a.value}</span>
                          {a.note && (
                            <span className="block text-[11.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
                              {a.note}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {call.returned && (
              <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                It returned <span className="font-mono text-[12px]">{call.returned}</span>, read from the ARC-4
                return log — the app writes the value prefixed with{" "}
                <span className="font-mono text-[12px]">151f7c75</span>, which is how a return is told apart
                from any other log line.
              </p>
            )}

            <dl className="mt-4 grid gap-x-8 gap-y-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: "var(--line)" }}>
              <Field
                label="Boxes referenced"
                mono
                hint="A transaction names the boxes it may touch; it does not carry their contents. What the box now holds is a separate read, which is why this page does not print a value it did not fetch."
              >
                {call.boxes.length ? call.boxes.join(", ") : "none"}
              </Field>
              <Field label="Sender" mono>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Out href={peraAddress(txn.sender ?? "")} title={txn.sender}>
                    {shortAddr(txn.sender ?? "", 10, 6)}
                  </Out>
                  <CopyButton text={txn.sender ?? ""} label="sender address" />
                </span>
              </Field>
              <Field label="On completion">{call.onCompletion}</Field>
              {call.foreignApps.length > 0 && (
                <Field
                  label="Apps it may call"
                  hint="An inner call to an app not listed here is refused by the AVM."
                >
                  {call.foreignApps.map((a) => (
                    <span key={a} className="mr-2 inline-block">
                      <Out href={peraApp(a)}>{a}</Out>
                    </span>
                  ))}
                </Field>
              )}
              {call.foreignAssets.length > 0 && (
                <Field label="Assets it may move" hint="Unlisted, an inner transfer of it is refused.">
                  {call.foreignAssets.map((a) => (
                    <span key={a} className="mr-2 inline-block">
                      <Out href={loraAsset(a)}>{a}</Out>
                    </span>
                  ))}
                </Field>
              )}
              {call.accounts.length > 0 && (
                <Field label="Accounts it may pay" mono>
                  {call.accounts.map((a) => (
                    <span key={a} className="mr-2 inline-block">
                      <Out href={peraAddress(a)} title={a}>
                        {shortAddr(a, 8, 6)}
                      </Out>
                    </span>
                  ))}
                </Field>
              )}
            </dl>

            {call.globalDelta.length > 0 && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                <h3 className="text-[12.5px] font-semibold">Global state it changed</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  The value AFTER the call, as the ledger recorded it.
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  {call.globalDelta.map((d) => (
                    <li key={d.key} className="text-[12.5px]">
                      <span className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                        {d.key}
                      </span>{" "}
                      <span className="tnum font-medium">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {call.inner.length > 0 && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                <h3 className="text-[12.5px] font-semibold">What the contract did in turn</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  Inner transactions the app submitted. They carry a fee of 0 — the outer call above funded the
                  whole pool, which is why its fee is a multiple of the minimum.
                </p>
                <ol className="mt-2 space-y-1">
                  {call.inner.map((i, idx) => (
                    <li key={idx} className="text-[12.5px]">
                      <span className="tnum" style={{ color: "var(--ink-3)" }}>
                        {idx + 1}.
                      </span>{" "}
                      <span className="font-medium">{i.kind}</span>
                      {i.detail && <span style={{ color: "var(--ink-2)" }}> — {i.detail}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </Panel>
      )}

      {x402 && (
        <Panel className="mt-5" title="x402 settlement" note={`nonce ${x402.nonce}`}>
          <div className="px-4 py-4">
            <p className="text-[13.5px] leading-relaxed">
              A caller asked for something, got a 402 carrying a price, attached the payment and retried. This
              is the payment: <span className="tnum font-medium">{usdc(units(x402.amountMicro))}</span>{" "}
              <Out href={loraAsset(x402.assetId)}>{assetName(x402.assetId)}</Out> from{" "}
              <Out href={peraAddress(x402.payer)} title={x402.payer}>
                {shortAddr(x402.payer, 8, 6)}
              </Out>{" "}
              to{" "}
              <Out href={peraAddress(x402.payee)} title={x402.payee}>
                {shortAddr(x402.payee, 8, 6)}
              </Out>
              .
            </p>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              The payer paid no network fee at all. The other leg of this group is a payment from the
              facilitator&rsquo;s fee payer{" "}
              <Out href={peraAddress(x402.feePayer)} title={x402.feePayer}>
                {shortAddr(x402.feePayer, 8, 6)}
              </Out>
              , carrying {(x402.sponsoredFee / 1e6).toFixed(4)} ALGO for the whole group — which is what lets an
              agent hold only the stablecoin and still transact. The two legs are tied together by the shared
              nonce <span className="font-mono text-[12px]">{x402.nonce}</span>, and this page calls it a
              settlement only because both notes are present.
            </p>
          </div>
        </Panel>
      )}

      {!call && !x402 && transfer && transfer.isSettlementAsset && (
        <Panel className="mt-5" title="Asset transfer">
          <div className="px-4 py-4">
            <p className="text-[13.5px] leading-relaxed">
              <span className="tnum font-medium">{usdc(transfer.units)}</span> {SETTLEMENT_ASSET.unitName} from{" "}
              <Out href={peraAddress(transfer.sender)} title={transfer.sender}>
                {shortAddr(transfer.sender, 8, 6)}
              </Out>{" "}
              to{" "}
              <Out href={peraAddress(transfer.receiver)} title={transfer.receiver}>
                {shortAddr(transfer.receiver, 8, 6)}
              </Out>
              , in <Out href={loraAsset(SETTLEMENT_ASSET.id)}>asset {SETTLEMENT_ASSET.id}</Out>.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              This is the asset the registries settle in, but the transfer carries no x402 note and sits in no
              sponsored group, so it is not called a settlement here. It is a transfer, which is all the ledger
              says it is.
            </p>
          </div>
        </Panel>
      )}

      {!call && !x402 && (!transfer || !transfer.isSettlementAsset) && (
        <Panel className="mt-5" title="Nothing here to decode">
          <EmptyState
            title={`A ${txn["tx-type"] ?? "transaction"} that is not one of Ripar's`}
            body={
              network === "mainnet"
                ? "This is a MainNet transaction and it carries no x402 payment note, so there is nothing here this explorer can decode further. Ripar's three registries are deployed on TestNet only — and application ids are per-network, so an id that matches one of theirs on MainNet is somebody else's contract and is deliberately not labelled as ours."
                : "This explorer decodes calls to the three ERC-8004 registries and transfers of the asset they settle in. This transaction is neither, so it is described as the ledger describes it and no further. The links below open it on two explorers that read the whole chain."
            }
          />
        </Panel>
      )}

      {others.length > 0 && (
        <Panel
          className="mt-5"
          title="The rest of the group"
          note={`${others.length + 1} transactions share group ${txn.group?.slice(0, 12)}…`}
        >
          <div className="overflow-x-auto">
            <table className="tbl w-full min-w-[720px]">
              <thead>
                <tr>
                  <PlainTh width={64}>#</PlainTh>
                  <PlainTh width={220}>Transaction</PlainTh>
                  <PlainTh width={110}>Type</PlainTh>
                  <PlainTh>What it is</PlainTh>
                </tr>
              </thead>
              <tbody>
                {group.map((t) => {
                  const inner = decodeAppCall(t, network);
                  const xfer = t["asset-transfer-transaction"];
                  const isThis = t.id === txn.id;
                  return (
                    <tr key={t.id}>
                      <td className="tnum" style={{ color: "var(--ink-3)" }}>
                        {t["intra-round-offset"] != null ? "·" : ""}
                      </td>
                      <td>
                        {isThis ? (
                          <span className="font-mono text-[12px] font-medium">this transaction</span>
                        ) : (
                          <Link
                            href={`/tx/${t.id}`}
                            className="font-mono text-[12px] underline-offset-2 hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            {t.id?.slice(0, 16)}…
                          </Link>
                        )}
                      </td>
                      <td className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                        {t["tx-type"]}
                      </td>
                      <td style={{ color: "var(--ink-2)" }}>
                        {inner
                          ? inner.signature
                            ? `${inner.signature} on ${inner.registry ?? `app ${inner.appId}`}`
                            : `app ${inner.appId}, selector 0x${inner.selectorHex}`
                          : xfer
                            ? `${int(Number(xfer.amount ?? 0))} base units of asset ${xfer["asset-id"]} to ${shortAddr(xfer.receiver ?? "", 8, 6)}`
                            : (decodeNote(t.note) ?? "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2.5 text-[12px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
            A group id is computed over every member, so each one commits to the others. Signing a subset,
            reordering them or submitting them separately does not do part of the job — it fails. That is the
            property both <span className="font-mono text-[11.5px]">fund_job</span> and{" "}
            <span className="font-mono text-[11.5px]">accept_feedback</span> rely on when they read an amount
            off the transfer next to them rather than off an argument.
          </p>
        </Panel>
      )}

      <Panel className="mt-5" title="The record itself">
        <dl className="grid gap-x-8 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Transaction id" mono>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="break-all">{txId}</span>
              <CopyButton text={txId} label="transaction id" />
            </span>
          </Field>
          <Field label="Confirmed">
            {txn["round-time"] ? absTime(new Date(txn["round-time"] * 1000).toISOString()) : "—"}
          </Field>
          <Field label="Block">
            {round ? <Out href={peraBlock(round)}>{int(round)}</Out> : "—"}
          </Field>
          {note && (
            <Field label="Note" mono hint="Shown only when the bytes are readable text; a note is arbitrary bytes.">
              {note}
            </Field>
          )}
          <Field
            label="Read it yourself"
            hint="No key, nothing of ours in the path. This is the indexer that answered — the other one was asked first and had nothing."
          >
            <Out href={`${indexer}/v2/transactions/${txId}`}>{`${indexer}/v2/transactions/${txId}`}</Out>
          </Field>
          {/* Network-aware, or every link on a MainNet transaction would open a
              TestNet explorer and 404 — which reads as "this is not real". */}
          <Field label="Second opinion">
            <span className="flex flex-wrap gap-x-4">
              <Out
                href={
                  network === "testnet"
                    ? peraTx(txId)
                    : `https://explorer.perawallet.app/tx/${txId}/`
                }
                mono={false}
              >
                Pera Explorer
              </Out>
              <Out
                href={
                  network === "testnet" ? loraTx(txId) : `https://lora.algokit.io/mainnet/transaction/${txId}`
                }
                mono={false}
              >
                Lora
              </Out>
            </span>
          </Field>
        </dl>
      </Panel>
    </Shell>
  );
}

function Shell({
  txId,
  network,
  children,
}: {
  txId: string;
  /** null before the lookup has settled on one. */
  network: TxNetwork | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Transaction</h1>
          <RealChainBadge />
          {network === "mainnet" ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
              style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
            >
              Algorand MainNet
            </span>
          ) : (
            <TestNetBadge />
          )}
          <Status tone="ok" label="Read from the indexer at request time" size="sm" />
        </div>
        <p className="mt-2 break-all font-mono text-[12.5px]" style={{ color: "var(--ink-2)" }}>
          {txId}
        </p>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          What this transaction actually did, decoded rather than transcribed. The ABI method comes from
          matching the selector against signatures derived at load time — nothing here maps an unknown selector
          onto a nearby method.{" "}
          {network === "mainnet" ? (
            <>
              This id was not on TestNet, so it was looked up on MainNet. Ripar&rsquo;s registries are TestNet
              only, and application ids are per-network, so nothing on a MainNet transaction is labelled as one
              of ours however closely the number matches.
            </>
          ) : (
            <>
              Registries: <Out href={peraApp(REGISTRIES.identity.appId)}>{REGISTRIES.identity.appId}</Out>{" "}
              <Out href={peraApp(REGISTRIES.reputation.appId)}>{REGISTRIES.reputation.appId}</Out>{" "}
              <Out href={peraApp(REGISTRIES.validation.appId)}>{REGISTRIES.validation.appId}</Out>.
            </>
          )}
        </p>
      </header>
      {children}
    </div>
  );
}
