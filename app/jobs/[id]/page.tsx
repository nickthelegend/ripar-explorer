import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  DEFAULT_NETWORK,
  SNAPSHOT,
  addressUrl,
  blockUrl,
  fetchAgent,
  fetchJob,
  fetchJobTransactions,
  isNetwork,
  networkLabel,
  txUrl,
  type Bid,
  type Job,
  type Network,
} from "@/lib/explorer-data";
import {
  ESCROW_STATE,
  JOB_STATUS,
  TONE_VAR,
  TX_KIND,
  TX_STATUS,
  VERIFICATION_STATE,
  absTime,
  algo,
  durationMin,
  int,
  relTime,
  shortAddr,
  usdc,
} from "@/lib/format";
import { withNetwork } from "@/lib/nav";
import { Chip, Field, Panel, Status } from "@/components/ui";
import { CopyButton, Mono } from "@/components/copy-button";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const job = await fetchJob(id);
  if (!job) return { title: "Job not found", robots: { index: false, follow: false } };
  return {
    title: job.title,
    description: `${JOB_STATUS[job.status].label} · ${job.bids.length} bid${job.bids.length === 1 ? "" : "s"} · ${usdc(job.budgetUsdc)} USDC budget on ${networkLabel(job.network)}. ${job.spec}`,
    alternates: { canonical: `/jobs/${job.id}` },
  };
}

const BID_STATE: Record<Bid["state"], { label: string; tone: keyof typeof TONE_VAR }> = {
  leading: { label: "Leading", tone: "info" },
  accepted: { label: "Awarded", tone: "ok" },
  outbid: { label: "Outbid", tone: "idle" },
  withdrawn: { label: "Withdrawn", tone: "idle" },
  rejected: { label: "Not selected", tone: "warn" },
};

export default async function JobDetailPage({ params, searchParams }: Params) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const job = await fetchJob(id);
  if (!job) notFound();

  const raw = typeof sp.network === "string" ? sp.network : null;
  const viewNetwork: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;
  const network = job.network;

  const [txs, winner] = await Promise.all([
    fetchJobTransactions(job.id),
    job.winnerAgentId ? fetchAgent(job.winnerAgentId) : Promise.resolve(null),
  ]);
  const bidders = await Promise.all(job.bids.map((b) => fetchAgent(b.agentId)));

  const s = JOB_STATUS[job.status];
  const e = ESCROW_STATE[job.escrow.state];
  const v = VERIFICATION_STATE[job.verification.state];
  const runtime =
    job.startedAt && job.endedAt ? (Date.parse(job.endedAt) - Date.parse(job.startedAt)) / 60000 : null;

  // Read the fee off the settlement itself rather than recomputing it from the
  // agreed price. Recomputing rounds differently from the transaction that
  // actually moved the money, so the Escrow panel and the money trail below it
  // ended up quoting two different fees for one payment.
  const releaseTx = txs.find((t) => t.kind === "escrow-release" && t.status === "confirmed") ?? null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Link
        href={withNetwork("/jobs", viewNetwork)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--ink-2)" }}
      >
        <ArrowLeft size={13} strokeWidth={2.2} />
        All jobs
      </Link>

      <header className="mt-4 border-b pb-6" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="max-w-[60ch] text-[1.55rem] font-semibold leading-[1.2] tracking-[-0.025em]">{job.title}</h1>
          <Status tone={s.tone} label={s.label} title={s.hint} pulse={job.status === "running"} />
          {job.network !== viewNetwork && <Chip>on {networkLabel(job.network)}</Chip>}
        </div>
        <p className="mt-1.5" style={{ color: "var(--ink-3)" }}>
          <Mono value={job.id} label="job id" />
        </p>
        {job.statusNote && (
          <p
            className="mt-3.5 max-w-[80ch] rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
            style={{
              borderColor: job.status === "failed" ? "rgba(192,38,38,0.28)" : "var(--line-strong)",
              background: job.status === "failed" ? "rgba(192,38,38,0.05)" : "var(--panel-2)",
              color: "var(--ink-2)",
            }}
          >
            {job.statusNote}
          </p>
        )}
      </header>

      {/* lifecycle */}
      <section className="border-b py-5" style={{ borderColor: "var(--line)" }}>
        <ol className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          <Step label="Posted" when={job.createdAt} detail={`${usdc(job.budgetUsdc)} USDC budget`} done />
          <Step
            label="Bidding closes"
            when={job.bidsCloseAt}
            detail={`${job.bids.length} bid${job.bids.length === 1 ? "" : "s"} received`}
            // Measured against the capture, like every other time on the page. Keying
            // this off status alone marked a window that closes in five hours as done.
            done={Date.parse(job.bidsCloseAt) <= Date.parse(SNAPSHOT)}
          />
          <Step
            label="Awarded"
            when={job.startedAt}
            detail={winner ? winner.name : job.status === "expired" ? "No bids to award" : "Not awarded"}
            done={Boolean(job.startedAt)}
          />
          <Step
            label={job.status === "failed" ? "Run ended" : "Result submitted"}
            when={job.status === "expired" || job.status === "cancelled" ? null : job.endedAt}
            detail={
              // A missed deadline is only a missed deadline if the job was actually
              // awarded and started. Keying off `not-run` alone had open jobs that
              // nobody has bid on yet reporting a blown deadline.
              job.startedAt && job.verification.state === "not-run"
                ? "Deadline passed with no result"
                : runtime != null
                  ? `${durationMin(runtime)} of runtime`
                  : "Not submitted"
            }
            done={Boolean(job.endedAt) && job.status !== "expired" && job.status !== "cancelled"}
          />
          <Step
            label="Settled"
            when={job.escrow.state === "released" || job.escrow.state === "refunded" ? job.endedAt : null}
            detail={`Escrow ${e.label.toLowerCase()}`}
            done={job.escrow.state === "released" || job.escrow.state === "refunded"}
            tone={job.escrow.state === "refunded" ? "verify" : "ok"}
          />
        </ol>
      </section>

      <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Specification">
            <div className="px-4 py-4">
              <p className="max-w-[80ch] text-[14px] leading-relaxed">{job.spec}</p>
              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--ink-3)" }}>
                Acceptance criteria
              </h3>
              <ul className="mt-2 space-y-1.5">
                {job.acceptance.map((line) => (
                  <li key={line} className="flex gap-2 text-[13.5px] leading-relaxed">
                    <span aria-hidden style={{ color: "var(--accent)" }}>
                      ·
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {job.skillsRequired.map((skill) => (
                  <Link
                    key={skill}
                    href={`${withNetwork("/agents", network)}${network === DEFAULT_NETWORK ? "?" : "&"}q=${encodeURIComponent(skill)}`}
                    title={`Agents with the ${skill} skill`}
                  >
                    <Chip>{skill}</Chip>
                  </Link>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="Bids"
            note={
              job.bids.length === 0
                ? "none received"
                : `${job.bids.length} received, cheapest first`
            }
          >
            {job.bids.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {job.status === "expired"
                  ? "The bidding window closed without a single bid, so the escrow refunded automatically."
                  : "No agent has bid on this job yet. The escrow is committed and refunds automatically if the window closes empty."}
              </p>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Agent</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Bid</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Quoted ETA</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Outcome</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Submitted</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.bids.map((bid, i) => {
                      const agent = bidders[i];
                      const st = BID_STATE[bid.state];
                      const awarded = bid.state === "accepted";
                      return (
                        <tr key={bid.agentId} style={awarded ? { background: "var(--wash)" } : undefined}>
                          <td className="relative max-w-[300px]">
                            {agent ? (
                              <Link
                                href={withNetwork(`/agents/${agent.id}`, network)}
                                className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
                              >
                                {agent.name}
                              </Link>
                            ) : (
                              <span className="font-mono text-[12px]">{bid.agentId}</span>
                            )}
                            <span className="above-rowlink mt-0.5 block" style={{ color: "var(--ink-3)" }}>
                              <Mono value={bid.agentId} label={`agent id ${bid.agentId}`} />
                            </span>
                          </td>
                          <td className="num tnum" style={awarded ? { fontWeight: 600 } : undefined}>
                            {usdc(bid.amountUsdc)}
                          </td>
                          <td className="num tnum" style={{ color: "var(--ink-2)" }}>
                            {durationMin(bid.etaMin)}
                          </td>
                          <td>
                            <Status tone={st.tone} label={st.label} title={bid.note ?? undefined} size="sm" />
                          </td>
                          <td className="num whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                            {relTime(bid.submittedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {job.awardReason && (
              <p
                className="border-t px-4 py-3 text-[12.5px] leading-relaxed"
                style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
              >
                <span className="font-medium" style={{ color: "var(--ink)" }}>
                  Why this bid won:{" "}
                </span>
                {job.awardReason}
              </p>
            )}
          </Panel>

          <Panel title="Money trail" note={`${txs.length} transaction${txs.length === 1 ? "" : "s"}, oldest first`}>
            {txs.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ink-2)" }}>
                No transaction has touched this job yet — the escrow has not been funded.
              </p>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Type</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Transaction</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Amount</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Result</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Round</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => {
                      const k = TX_KIND[t.kind];
                      const st = TX_STATUS[t.status];
                      return (
                        <tr key={t.id}>
                          <td>
                            <Status tone={k.tone} label={k.label} title={k.hint} size="sm" />
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1">
                              <Link
                                href={withNetwork(`/transactions/${t.id}`, network)}
                                title={t.id}
                                className="font-mono text-[12px] hover:underline"
                                style={{ color: "var(--accent-deep)" }}
                              >
                                {t.id.slice(0, 16)}…
                              </Link>
                              <a
                                href={txUrl(t.network, t.id)}
                                target="_blank"
                                rel="noreferrer"
                                title={`${t.id} on the block explorer — sample ids do not resolve`}
                                aria-label={`Open ${t.id} on the block explorer`}
                                style={{ color: "var(--ink-3)" }}
                              >
                                <ArrowUpRight size={10.5} strokeWidth={2.4} />
                              </a>
                              <CopyButton text={t.id} label={`transaction id ${t.id}`} />
                            </span>
                            {t.failureReason && (
                              <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: "var(--bad)" }}>
                                {t.failureReason}
                              </span>
                            )}
                          </td>
                          <td className="num tnum">{usdc(t.amountUsdc)}</td>
                          <td>
                            <Status tone={st.tone} label={st.label} size="sm" />
                          </td>
                          <td className="num tnum">
                            <a
                              href={blockUrl(t.network, t.round)}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                              style={{ color: "var(--ink-2)" }}
                            >
                              {int(t.round)}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Escrow">
            <div className="px-4 py-4">
              <Status tone={e.tone} label={e.label} title={e.hint} />
              <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {e.hint}
              </p>
              <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
                <Field label="Budget posted" hint="Committed in full when the job was funded.">
                  <span className="tnum">{usdc(job.budgetUsdc)} USDC</span>
                </Field>
                <Field
                  label="Held right now"
                  hint={job.escrow.heldUsdc === 0 && job.escrow.state !== "unfunded" ? "Settled — the escrow is empty." : undefined}
                >
                  <span className="tnum">
                    {job.escrow.state === "unfunded" ? "—" : `${usdc(job.escrow.heldUsdc)} USDC`}
                  </span>
                </Field>
                <Field label="Agreed price" hint="The winning bid, which is what the agent is actually paid.">
                  <span className="tnum">
                    {job.escrow.agreedUsdc == null ? "—" : `${usdc(job.escrow.agreedUsdc)} USDC`}
                  </span>
                </Field>
                <Field label="Protocol fee" hint="1.5% of the agreed price, withheld inside the release.">
                  <span className="tnum">
                    {releaseTx ? `${usdc(releaseTx.protocolFeeUsdc)} USDC` : "—"}
                  </span>
                </Field>
                <Field label="Escrow app" mono hint={job.escrow.appId ? undefined : "Not created until the budget is committed."}>
                  {job.escrow.appId ? <Mono value={String(job.escrow.appId)} label="escrow app id" /> : <span style={{ color: "var(--ink-3)" }}>—</span>}
                </Field>
                <Field label="Network fees">
                  <span className="tnum">
                    {algo(txs.reduce((sum, t) => sum + t.feeMicroAlgo, 0))} ALGO
                  </span>
                </Field>
              </dl>
            </div>
          </Panel>

          <Panel title="Verification">
            <div className="px-4 py-4">
              <Status tone={v.tone} label={v.label} />
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Method" hint={METHOD_HINT[job.verification.method]}>
                  {job.verification.method}
                </Field>
                <Field label="Attestors">
                  <span className="tnum">{job.verification.attestors || "—"}</span>
                </Field>
                <Field label="Score">
                  <span className="tnum" style={{ color: job.verification.state === "failed" ? "var(--bad)" : undefined }}>
                    {job.verification.score == null ? "—" : `${job.verification.score} / 100`}
                  </span>
                </Field>
              </dl>
              {job.verification.note && (
                <p
                  className="mt-4 border-t pt-3.5 text-[12.5px] leading-relaxed"
                  style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
                >
                  {job.verification.note}
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Parties">
            <dl className="grid gap-4 px-4 py-4">
              <Field label="Requester" mono>
                <Mono
                  value={job.requester}
                  display={shortAddr(job.requester, 14, 10)}
                  label="requester address"
                  href={addressUrl(network, job.requester)}
                />
              </Field>
              <Field label="Awarded agent">
                {winner ? (
                  <Link
                    href={withNetwork(`/agents/${winner.id}`, network)}
                    className="font-medium hover:underline"
                    style={{ color: "var(--accent-deep)" }}
                  >
                    {winner.name}
                  </Link>
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>Not awarded</span>
                )}
              </Field>
              <Field label="Posted at round" mono>
                <a
                  href={blockUrl(network, job.createdRound)}
                  target="_blank"
                  rel="noreferrer"
                  className="tnum inline-flex items-center gap-0.5 hover:underline"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {int(job.createdRound)}
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </a>
              </Field>
              <Field label="Network">{networkLabel(network)}</Field>
            </dl>
          </Panel>

          <Panel
            title="Raw record"
            note="exactly what the query layer returned"
            action={<CopyButton text={JSON.stringify(job, null, 2)} label="the raw job record" />}
          >
            <pre
              className="max-h-[380px] overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-relaxed"
              style={{ background: "var(--panel-2)", color: "var(--ink-2)" }}
            >
              {JSON.stringify(job, null, 2)}
            </pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const METHOD_HINT: Record<Job["verification"]["method"], string> = {
  attestation: "The requester signs off, inside a fixed review window.",
  quorum: "Independent verifier agents re-run the acceptance checks and vote.",
  oracle: "An external data source decides, with no human in the loop.",
};

/**
 * A stage that has not happened yet says so, rather than being hidden. Knowing
 * a job never reached verification is information; a missing row is not.
 */
function Step({
  label,
  when,
  detail,
  done,
  tone = "ok",
}: {
  label: string;
  when: string | null;
  detail: string;
  done: boolean;
  tone?: "ok" | "verify";
}) {
  return (
    <li className="min-w-0 border-l-2 pl-3" style={{ borderColor: done ? TONE_VAR[tone] : "var(--line-strong)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: done ? "var(--ink)" : "var(--ink-3)" }}>
        {label}
      </p>
      <p className="tnum mt-1 text-[12.5px]" style={{ color: when ? "var(--ink-2)" : "var(--ink-3)" }}>
        {when ? absTime(when) : "Not reached"}
      </p>
      <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-3)" }} title={detail}>
        {when ? `${relTime(when)} · ${detail}` : detail}
      </p>
    </li>
  );
}
