import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  DEFAULT_NETWORK,
  addressUrl,
  blockUrl,
  fetchAgent,
  fetchJob,
  fetchTransaction,
  isNetwork,
  networkLabel,
  txUrl,
  type Network,
} from "@/lib/explorer-data";
import { TX_KIND, TX_STATUS, absTime, algo, int, relTime, shortAddr, usdc } from "@/lib/format";
import { withNetwork } from "@/lib/nav";
import { Chip, Field, Panel, Status } from "@/components/ui";
import { Mono } from "@/components/copy-button";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const tx = await fetchTransaction(id);
  if (!tx) return { title: "Transaction not found", robots: { index: false, follow: false } };
  return {
    title: `${TX_KIND[tx.kind].label} · ${tx.id}`,
    description: `${TX_STATUS[tx.status].label} ${TX_KIND[tx.kind].label.toLowerCase()} of ${usdc(tx.amountUsdc)} USDC in round ${int(tx.round)} on ${networkLabel(tx.network)}.`,
    alternates: { canonical: `/transactions/${tx.id}` },
  };
}

export default async function TransactionDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const raw = Array.isArray(sp.network) ? sp.network[0] : sp.network;
  const network: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;

  const tx = await fetchTransaction(id);
  if (!tx) notFound();

  // Both sides are optional: a job settlement has an agent and a job, while a
  // plain endpoint payment has neither.
  const [job, agent] = await Promise.all([
    tx.jobId ? fetchJob(tx.jobId) : Promise.resolve(null),
    tx.agentId ? fetchAgent(tx.agentId) : Promise.resolve(null),
  ]);

  const gross = tx.amountUsdc + tx.protocolFeeUsdc;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Link
        href={withNetwork("/transactions", network)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--ink-2)" }}
      >
        <ArrowLeft size={13} strokeWidth={2.2} />
        All transactions
      </Link>

      <header className="mt-4 border-b pb-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">{TX_KIND[tx.kind].label}</h1>
          <Status tone={TX_STATUS[tx.status].tone} label={TX_STATUS[tx.status].label} />
          <Chip>{networkLabel(tx.network)}</Chip>
        </div>
        <p className="mt-2 max-w-[80ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {TX_KIND[tx.kind].hint}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Mono value={tx.id} label="transaction id" />
          <a
            href={txUrl(tx.network, tx.id)}
            target="_blank"
            rel="noreferrer"
            title="Opens allo.info — sample ids do not resolve"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--accent-deep)" }}
          >
            View on the block explorer
            <ArrowUpRight size={12} strokeWidth={2.4} />
          </a>
        </div>
      </header>

      {tx.status === "failed" && tx.failureReason && (
        <div
          className="mt-6 rounded-xl border px-4 py-3.5"
          style={{ borderColor: "rgba(192,38,38,0.28)", background: "rgba(192,38,38,0.05)" }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--bad)" }}>
            Why it failed
          </p>
          <p className="mt-1 font-mono text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {tx.failureReason}
          </p>
          <p className="mt-2 max-w-[80ch] text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            A rejected payment moves nothing. The caller keeps their USDC and the endpoint was never run, so
            nobody was charged for work that did not happen.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel
          title="Payment"
          note="the protocol fee is withheld inside this same transaction"
        >
          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Recipient receives" hint="Already net of the protocol fee.">
              <span className="tnum font-medium">{usdc(tx.amountUsdc)} USDC</span>
            </Field>
            <Field
              label="Protocol fee"
              hint="This capture assumes 1.5% of the agreed price on a release and none on anything else. It is the sample's own convention: the deployed ValidationRegistry has no fee mechanism and release_escrow sends the whole balance."
            >
              <span className="tnum">{tx.protocolFeeUsdc ? `${usdc(tx.protocolFeeUsdc)} USDC` : "—"}</span>
            </Field>
            <Field label="Gross amount">
              <span className="tnum">{usdc(gross)} USDC</span>
            </Field>
            <Field label="Network fee">
              <span className="tnum">{algo(tx.feeMicroAlgo)} ALGO</span>
            </Field>
          </dl>
        </Panel>

        <Panel title="Settlement">
          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Round" mono>
              <a
                href={blockUrl(tx.network, tx.round)}
                target="_blank"
                rel="noreferrer"
                className="tnum inline-flex items-center gap-0.5 hover:underline"
                style={{ color: "var(--accent-deep)" }}
              >
                {int(tx.round)}
                <ArrowUpRight size={11} strokeWidth={2.4} />
              </a>
            </Field>
            <Field label="Confirmed" hint={relTime(tx.timestamp)}>
              <span className="tnum">{absTime(tx.timestamp)}</span>
            </Field>
            <div className="sm:col-span-2">
              <Field label="From" mono>
                <Mono
                  value={tx.from}
                  display={shortAddr(tx.from, 14, 10)}
                  label="sender address"
                  href={addressUrl(tx.network, tx.from)}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="To" mono>
                <Mono
                  value={tx.to}
                  display={shortAddr(tx.to, 14, 10)}
                  label="recipient address"
                  href={addressUrl(tx.network, tx.to)}
                />
              </Field>
            </div>
          </dl>
        </Panel>
      </div>

      {tx.x402 && (
        <Panel
          className="mt-5"
          title="x402 payload"
          note="lifted out of the transaction note field"
        >
          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Scheme" mono>
              {tx.x402.scheme}
            </Field>
            <Field label="Request id" mono hint="Travels with the payment, so reconciling a call to its charge is a lookup rather than an investigation.">
              <Mono value={tx.x402.requestId} label="x402 request id" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Resource" mono>
                <Mono value={tx.x402.resource} label="resource path" />
              </Field>
            </div>
          </dl>
        </Panel>
      )}

      {(job || agent) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {job && (
            <Panel title="Job">
              <div className="px-4 py-4">
                <Link
                  href={withNetwork(`/jobs/${job.id}`, network)}
                  className="text-[14px] font-medium hover:underline"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {job.title}
                </Link>
                <span className="mt-1 block">
                  <Mono value={job.id} label="job id" />
                </span>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {job.spec}
                </p>
              </div>
            </Panel>
          )}
          {agent && (
            <Panel title="Agent">
              <div className="px-4 py-4">
                <Link
                  href={withNetwork(`/agents/${agent.id}`, network)}
                  className="text-[14px] font-medium hover:underline"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {agent.name}
                </Link>
                <span className="mt-1 block">
                  <Mono value={agent.id} label="agent id" />
                </span>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {agent.summary}
                </p>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
