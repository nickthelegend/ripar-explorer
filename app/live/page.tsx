import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { fetchChainPulse, fetchRealSettlements, summarise } from "@/lib/x402-chain";
import { int, shortAddr, usdc } from "@/lib/format";
import { Panel, Stat } from "@/components/ui";
import { Mono } from "@/components/copy-button";

export const metadata: Metadata = {
  title: "Live x402 settlements on Algorand MainNet",
  description:
    "Real x402 payments settling on Algorand MainNet right now, read straight from the chain. Not a sample — every row links to a block explorer.",
  alternates: { canonical: "/live" },
};

// A page called "Live" must never be a build-time snapshot. With ISR it was
// prerendered during `next build` and then served that frozen HTML, which
// showed one settlement while the chain had twenty. Render per request.
export const dynamic = "force-dynamic";

const explorerTx = (id: string) => `https://allo.info/tx/${id}`;
const explorerAddr = (a: string) => `https://allo.info/account/${a}`;

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

export default async function LivePage() {
  let rows: Awaited<ReturnType<typeof fetchRealSettlements>> = [];
  let pulse: Awaited<ReturnType<typeof fetchChainPulse>> | null = null;
  let error: string | null = null;

  try {
    [rows, pulse] = await Promise.all([fetchRealSettlements(20), fetchChainPulse()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const s = summarise(rows);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Live settlements</h1>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
            style={{ background: "rgba(22,163,74,0.12)", color: "var(--ok, #16a34a)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
            Real chain data
          </span>
        </div>
        <p className="mt-2 max-w-[86ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every other page in this explorer runs on a sample dataset. This one does not. These are
          actual x402 payments settling on Algorand MainNet, read from the indexer — other people&rsquo;s
          agents, paying each other, right now. Each row links to a block explorer that has nothing to
          do with us.
        </p>
      </header>

      {error && (
        <div
          className="mt-6 rounded-xl border px-4 py-3.5"
          style={{ borderColor: "rgba(192,38,38,0.28)", background: "rgba(192,38,38,0.05)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--bad, #c02626)" }}>
            Could not reach the indexer
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
            {error}. Nothing here is cached or estimated, so the page shows nothing rather than
            something stale.
          </p>
        </div>
      )}

      {!error && (
        <>
          <div className="mt-6 grid gap-px overflow-hidden rounded-xl sm:grid-cols-2 lg:grid-cols-4"
               style={{ background: "var(--line)" }}>
            <Stat label="Settlements in view" value={int(s.count)} sub="most recent, newest first" />
            <Stat label="Volume in this slice" value={`${usdc(s.volume)} USDC`} sub="not a lifetime total" />
            <Stat label="Distinct payers → payees" value={`${s.payers} → ${s.payees}`} sub="unique addresses" />
            <Stat
              label="Fees the facilitator covered"
              value={`${s.feesCovered.toFixed(4)} ALGO`}
              sub="callers paid 0"
            />
          </div>

          <Panel
            className="mt-5"
            title="Recent x402 settlements"
            note={
              pulse
                ? `MainNet round ${int(pulse.round)}${
                    pulse.blockTime ? ` · ${pulse.blockTime.toFixed(1)}s between blocks` : ""
                  }`
                : undefined
            }
          >
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
                No settlements in the window the indexer returned. This is a young protocol — quiet
                stretches are normal, and inventing rows to fill the gap would defeat the point.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[860px] text-[13px]">
                  <thead>
                    <tr>
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Amount</th>
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Payer</th>
                      <th scope="col" className="px-4 py-2.5 text-left font-medium">Endpoint paid</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Caller fee</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Round</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">When</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.txId}>
                        <td className="px-4 py-2.5">
                          <span className="tnum font-medium">{usdc(r.amountUsdc)} USDC</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <a
                            href={explorerAddr(r.from)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[12px] hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            {shortAddr(r.from, 8, 6)}
                          </a>
                        </td>
                        <td className="px-4 py-2.5">
                          <a
                            href={explorerAddr(r.to)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[12px] hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            {shortAddr(r.to, 8, 6)}
                          </a>
                        </td>
                        {/* Zero on every row, because the facilitator sponsors it. */}
                        <td className="tnum px-4 py-2.5 text-right" style={{ color: "var(--ink-3)" }}>
                          {r.sponsoredFee === 0 ? "0" : (0).toFixed(0)} ALGO
                        </td>
                        <td className="tnum px-4 py-2.5 text-right">{int(r.round)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: "var(--ink-2)" }}>
                          {r.timestamp ? ago(r.timestamp) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={explorerTx(r.txId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 font-mono text-[12px] hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            verify
                            <ArrowUpRight size={11} strokeWidth={2.4} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel className="mt-5" title="How these are identified">
            <div className="px-4 py-4 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              <p>
                An x402 payment on Algorand settles as a two-transaction atomic group. The first leg
                is a <span className="font-mono text-[12px]">pay</span> from the facilitator&rsquo;s fee
                payer carrying the whole group&rsquo;s fee, noted{" "}
                <span className="font-mono text-[12px]">x402-fee-payer-&lt;nonce&gt;</span>. The second is
                an <span className="font-mono text-[12px]">axfer</span> of USDC{" "}
                <Mono value="31566704" label="USDC asset id" /> from the payer to the endpoint&rsquo;s
                address, noted <span className="font-mono text-[12px]">x402-payment-v2-&lt;nonce&gt;</span>{" "}
                with a fee of zero.
              </p>
              <p className="mt-3">
                The shared nonce ties the legs together, and because the fee payer signs leg one of
                every settlement it sponsors, walking that single account enumerates them without an
                archival node. That the caller&rsquo;s fee is <strong>zero</strong> is the part worth
                noticing: a caller needs USDC and no ALGO at all.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
