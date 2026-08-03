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
    <div className="space-y-6">
      <div>
        <Link
          href={withNetwork("/transactions", network)}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={14} /> All transactions
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{TX_KIND[tx.kind].label}</h1>
          <Status tone={TX_STATUS[tx.status].tone} label={TX_STATUS[tx.status].label} />
          <Chip>{networkLabel(tx.network)}</Chip>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Mono value={tx.id} label="Copy transaction id" />
          <a
            href={txUrl(tx.network, tx.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] text-[var(--ink-2)] underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
          >
            View on the block explorer <ArrowUpRight size={12} />
          </a>
        </div>
      </div>

      {tx.status === "failed" && tx.failureReason && (
        <Panel
          title="Why it failed"
          note="A rejected payment moves nothing. The caller keeps their USDC and the endpoint was never run, so nobody was charged for work that did not happen."
        >
          <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{tx.failureReason}</p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Payment"
          note="The protocol fee is withheld inside this same transaction — there is no separate transfer, and no moment where Ripar holds the balance."
        >
          <dl className="space-y-3">
            <Field label="Recipient receives">
              <span className="tnum font-medium">{usdc(tx.amountUsdc)} USDC</span>
            </Field>
            <Field label="Protocol fee">
              <span className="tnum">{tx.protocolFeeUsdc ? `${usdc(tx.protocolFeeUsdc)} USDC` : "—"}</span>
            </Field>
            <Field label="Gross amount">
              <span className="tnum">{usdc(gross)} USDC</span>
            </Field>
            <Field label="Network fee">
              <span className="tnum">{algo(tx.feeMicroAlgo)}</span>
            </Field>
          </dl>
        </Panel>

        <Panel title="Settlement">
          <dl className="space-y-3">
            <Field label="Round">
              <a
                href={blockUrl(tx.network, tx.round)}
                target="_blank"
                rel="noreferrer"
                className="tnum underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              >
                {int(tx.round)}
              </a>
            </Field>
            <Field label="Confirmed" hint={absTime(tx.timestamp)}>
              {relTime(tx.timestamp)}
            </Field>
            <Field label="From">
              <Mono
                value={tx.from}
                display={shortAddr(tx.from)}
                label="Copy sender address"
                href={addressUrl(tx.network, tx.from)}
              />
            </Field>
            <Field label="To">
              <Mono
                value={tx.to}
                display={shortAddr(tx.to)}
                label="Copy recipient address"
                href={addressUrl(tx.network, tx.to)}
              />
            </Field>
          </dl>
        </Panel>
      </div>

      {tx.x402 && (
        <Panel
          title="x402 payload"
          note="Because the request id travels with the payment, reconciling a call to its charge is a lookup rather than an investigation."
        >
          <dl className="space-y-3">
            <Field label="Scheme" mono>
              {tx.x402.scheme}
            </Field>
            <Field label="Resource">
              <Mono value={tx.x402.resource} label="Copy resource path" />
            </Field>
            <Field label="Request id">
              <Mono value={tx.x402.requestId} label="Copy request id" />
            </Field>
          </dl>
        </Panel>
      )}

      {(job || agent) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {job && (
            <Panel title="Job">
              <Link
                href={withNetwork(`/jobs/${job.id}`, network)}
                className="text-[14px] font-medium underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              >
                {job.title}
              </Link>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">{job.spec}</p>
            </Panel>
          )}
          {agent && (
            <Panel title="Agent">
              <Link
                href={withNetwork(`/agents/${agent.id}`, network)}
                className="text-[14px] font-medium underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
              >
                {agent.name}
              </Link>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">{agent.summary}</p>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
