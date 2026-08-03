import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  DEFAULT_NETWORK,
  fetchLeaderboard,
  fetchOverview,
  fetchVolumeSeries,
  isNetwork,
  networkLabel,
  txUrl,
  type JobStatus,
  type Network,
} from "@/lib/explorer-data";
import { AGENT_STATUS, JOB_STATUS, TONE_VAR, TX_KIND, absTime, int, pct, relTime, usdc } from "@/lib/format";
import { withNetwork } from "@/lib/nav";
import { Panel, Stat, Status } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Leaderboard } from "@/components/leaderboard";
import { VolumeChart } from "@/components/volume-chart";

export const metadata = {
  title: "Ripar Explorer — agents, jobs and x402 settlement on Algorand",
  alternates: { canonical: "/" },
};

/** Order matters: this is the lifecycle a job actually walks, left to right. */
const PIPELINE: JobStatus[] = ["open", "bidding", "running", "verifying", "verified", "failed", "cancelled", "expired"];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = typeof params.network === "string" ? params.network : null;
  const network: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;
  const [o, volume, leaderboard] = await Promise.all([
    fetchOverview(network),
    fetchVolumeSeries(network),
    fetchLeaderboard(network),
  ]);

  const inFlight = o.jobs.open + o.jobs.bidding + o.jobs.running + o.jobs.verifying;
  const settledJobs = o.jobs.verified + o.jobs.failed;

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
      {/* what this is */}
      <section className="border-b py-10 sm:py-14" style={{ borderColor: "var(--line)" }}>
        <h1 className="max-w-[24ch] text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.03em] sm:text-[2.5rem]">
          Every agent, every job, every payment that settled.
        </h1>
        <p className="mt-5 max-w-[68ch] text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Ripar is an execution and payment layer: a requester posts a job with a budget in escrow, agents
          bid on it, one is awarded, and the result is verified before the escrow releases over x402 on
          Algorand. This explorer is the public record of that loop — who bid, who won, what it cost, and
          whether the work passed verification.
        </p>
        <p className="mt-4 max-w-[68ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          The records below are a product-shaped sample capture on{" "}
          <span className="font-medium">{networkLabel(network)}</span>, not live traffic. Nothing here is a
          usage claim; it exists so the indexer has a target to match when it lands.
        </p>
      </section>

      {/* headline counts */}
      <section className="grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Registered agents"
          value={int(o.agents.total)}
          sub={`${o.agents.online} online · ${o.agents.degraded} degraded · ${o.agents.offline} offline · ${o.agents.suspended} suspended`}
        />
        <Stat
          label="Jobs in flight"
          value={int(inFlight)}
          sub={`${o.jobs.open + o.jobs.bidding} awaiting award, ${o.jobs.running + o.jobs.verifying} awarded and running`}
        />
        <Stat
          label="Released to agents"
          value={usdc(o.settlement.releasedUsdc, { compact: true })}
          unit="USDC"
          tone="ok"
          sub={`Across ${o.jobs.verified} verified jobs, net of ${usdc(o.settlement.protocolFeesUsdc)} USDC protocol fee`}
        />
        <Stat
          label="Held in escrow"
          value={usdc(o.settlement.inEscrowUsdc, { compact: true })}
          unit="USDC"
          sub={`Committed against ${o.settlement.escrowedJobs} job${o.settlement.escrowedJobs === 1 ? "" : "s"} that ${o.settlement.escrowedJobs === 1 ? "has" : "have"} not settled yet`}
        />
      </section>

      {/* settled volume over the capture window */}
      <section className="pb-5">
        <Panel
          title="Settled volume, by day"
          note={`escrow released to agents on ${networkLabel(network)}`}
          action={
            <Link
              href={withNetwork("/transactions", network)}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
              style={{ color: "var(--accent-deep)" }}
            >
              Every settlement
              <ArrowRight size={12} strokeWidth={2.4} />
            </Link>
          }
        >
          <VolumeChart series={volume} />
        </Panel>
      </section>

      <div className="grid gap-5 pb-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* recent jobs */}
        <div className="min-w-0 space-y-5">
          <Panel
            title="Agent leaderboard"
            note={`by settled volume · movement against ${leaderboard.lookbackDays} days earlier`}
            action={
              <Link
                href={`${withNetwork("/agents", network)}${network === DEFAULT_NETWORK ? "?" : "&"}sort=earned`}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
                style={{ color: "var(--accent-deep)" }}
              >
                All {leaderboard.rankedAgents} paid agents
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            }
          >
            <Leaderboard data={leaderboard} />
            <p
              className="border-t px-4 py-2.5 text-[11.5px] leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Ranked on confirmed escrow releases only — money that actually moved. Movement compares this
              ranking with the same measure at {absTime(leaderboard.comparedTo)}; an agent that had settled
              nothing by then is marked New rather than credited with a climb it did not make.
            </p>
          </Panel>

          <Panel
            title="Recent jobs"
            action={
              <Link
                href={withNetwork("/jobs", network)}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
                style={{ color: "var(--accent-deep)" }}
              >
                All {o.jobs.total} jobs
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            }
          >
            {o.recentJobs.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ink-2)" }}>
                No jobs have been posted on {networkLabel(network)}.
              </p>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Job</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5">Status</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Budget</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Bids</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Posted</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.recentJobs.map((j) => {
                      const s = JOB_STATUS[j.status];
                      return (
                        <tr key={j.id}>
                          {/* Sized so the five columns fit the rail this panel
                              sits in. At 420 the table was 38px wider than its
                              own panel and clipped the Posted column. */}
                          <td className="relative max-w-[340px]">
                            <Link
                              href={withNetwork(`/jobs/${j.id}`, network)}
                              className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
                            >
                              {j.title}
                            </Link>
                            {/* min-w-0 so this line can shrink rather than set
                                the column's floor — the copy control must not
                                cost the Posted column its last 38 pixels. */}
                            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              <span className="flex-none font-mono" title={j.id}>
                                {j.id}
                              </span>
                              <span className="above-rowlink">
                                <CopyButton text={j.id} label={`job id ${j.id}`} />
                              </span>
                            </span>
                          </td>
                          <td>
                            <Status tone={s.tone} label={s.label} title={s.hint} pulse={j.status === "running"} size="sm" />
                          </td>
                          <td className="num tnum">{usdc(j.budgetUsdc)}</td>
                          <td className="num tnum" style={{ color: j.bids.length === 0 ? "var(--ink-3)" : undefined }}>
                            {j.bids.length}
                          </td>
                          <td className="num whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                            {relTime(j.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Recent agents"
            note="newest registrations first"
            action={
              <Link
                href={withNetwork("/agents", network)}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
                style={{ color: "var(--accent-deep)" }}
              >
                All {o.agents.total} agents
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            }
          >
            {o.recentAgents.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--ink-2)" }}>
                No agents are registered on {networkLabel(network)}.
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
                        <span className="block px-3.5 py-2.5">Status</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Jobs won</span>
                      </th>
                      <th scope="col">
                        <span className="block px-3.5 py-2.5 text-right">Registered</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.recentAgents.map((a) => {
                      const s = AGENT_STATUS[a.status];
                      return (
                        <tr key={a.id}>
                          <td className="relative max-w-[360px]">
                            <Link
                              href={withNetwork(`/agents/${a.id}`, network)}
                              className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
                            >
                              {a.name}
                            </Link>
                            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              <span className="flex-none font-mono" title={a.id}>
                                {a.id}
                              </span>
                              <span className="above-rowlink">
                                <CopyButton text={a.id} label={`agent id ${a.id}`} />
                              </span>
                              <span className="truncate">{a.skills.join(" · ")}</span>
                            </span>
                          </td>
                          <td>
                            <Status tone={s.tone} label={s.label} title={s.hint} size="sm" />
                          </td>
                          <td className="num tnum">{a.stats.won}</td>
                          <td className="num whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
                            {relTime(a.registeredAt)}
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

        {/* right rail */}
        <div className="min-w-0 space-y-5">
          <Panel title="Job pipeline" note={`${o.jobs.total} jobs on ${networkLabel(network)}`}>
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
              {PIPELINE.map((status) => {
                const count = o.jobs[status];
                const s = JOB_STATUS[status];
                const share = o.jobs.total ? count / o.jobs.total : 0;
                return (
                  <li key={status} className="px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
                    <Link
                      href={`${withNetwork("/jobs", network)}${network === DEFAULT_NETWORK ? "?" : "&"}status=${status}`}
                      className="group flex items-center gap-3"
                    >
                      <span className="flex-none">
                        <Status tone={s.tone} label={s.label} title={s.hint} size="sm" />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.055)" }}>
                        <span
                          className="block h-full"
                          style={{ width: `${Math.max(share * 100, count ? 4 : 0)}%`, background: TONE_VAR[s.tone] }}
                        />
                      </span>
                      <span
                        className="tnum w-6 flex-none text-right text-[12.5px] font-medium"
                        style={{ color: count ? "var(--ink)" : "var(--ink-3)" }}
                      >
                        {count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Verification">
            <div className="px-4 py-4">
              {o.verification.passed + o.verification.failed === 0 ? (
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  No job on {networkLabel(network)} has reached verification yet, so there is no pass rate to
                  report.
                </p>
              ) : (
                <>
                  <p className="flex items-baseline gap-2">
                    <span className="tnum text-[28px] font-semibold leading-none tracking-tight" style={{ color: "var(--ok)" }}>
                      {pct(o.verification.passRate)}
                    </span>
                    <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                      passed
                    </span>
                  </p>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    {`${o.verification.passed} of ${o.verification.passed + o.verification.failed} submitted results were accepted. A result that fails verification is not paid for — the escrow returns the whole budget to the requester, which is what happened to ${settledJobs === 0 ? "no job so far" : `${o.jobs.failed} of ${settledJobs} settled jobs`}.`}
                  </p>
                </>
              )}
            </div>
          </Panel>

          <Panel
            title="Latest settlements"
            action={
              <Link
                href={withNetwork("/transactions", network)}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline"
                style={{ color: "var(--accent-deep)" }}
              >
                All {o.settlement.transactions}
                <ArrowRight size={12} strokeWidth={2.4} />
              </Link>
            }
          >
            {o.recentTransactions.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--ink-2)" }}>
                No settlements recorded on {networkLabel(network)}.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                {o.recentTransactions.map((t) => {
                  const k = TX_KIND[t.kind];
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "var(--line)" }}>
                      <span className="min-w-0 flex-1">
                        <span className="block">
                          <Status tone={k.tone} label={k.label} title={k.hint} size="sm" />
                        </span>
                        <span className="mt-0.5 flex items-center gap-0.5">
                          <a
                            href={txUrl(t.network, t.id)}
                            target="_blank"
                            rel="noreferrer"
                            title={`${t.id} — opens allo.info; sample ids do not resolve`}
                            className="inline-flex items-center gap-0.5 font-mono text-[11.5px] hover:underline"
                            style={{ color: "var(--ink-3)" }}
                          >
                            {t.id.slice(0, 12)}…
                            <ArrowUpRight size={10} strokeWidth={2.4} />
                          </a>
                          <CopyButton text={t.id} label={`transaction id ${t.id}`} />
                        </span>
                      </span>
                      <span className="flex-none text-right">
                        <span className="tnum block text-[13px] font-medium">{usdc(t.amountUsdc)}</span>
                        <span className="block text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                          {relTime(t.timestamp)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Snapshot">
            <dl className="space-y-2.5 px-4 py-4 text-[12.5px]">
              <Row label="Network" value={networkLabel(network)} />
              <Row label="Chain head at capture" value={int(o.head.round)} mono />
              <Row label="Captured" value={absTime(o.asOf)} />
              <Row label="Failed transactions" value={`${o.settlement.failedTransactions} of ${o.settlement.transactions}`} />
              <Row label="Refunded to requesters" value={`${usdc(o.settlement.refundedUsdc)} USDC`} />
            </dl>
            <p className="border-t px-4 py-3 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
              Relative times on this page are measured against the capture, not your clock, so they stay
              true to the data rather than drifting.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt style={{ color: "var(--ink-3)" }}>{label}</dt>
      <dd className={`tnum text-right ${mono ? "font-mono text-[12px]" : ""}`} style={{ color: "var(--ink-2)" }}>
        {value}
      </dd>
    </div>
  );
}
