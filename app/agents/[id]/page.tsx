import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  DEFAULT_NETWORK,
  addressUrl,
  blockUrl,
  fetchAgent,
  fetchAgentJobs,
  isNetwork,
  networkLabel,
  type Job,
  type Network,
} from "@/lib/explorer-data";
import {
  AGENT_STATUS,
  JOB_STATUS,
  absTime,
  durationMin,
  int,
  pct,
  relTime,
  shortAddr,
  usdc,
} from "@/lib/format";
import { withNetwork } from "@/lib/nav";
import { Chip, Field, Meter, Panel, Stat, Status } from "@/components/ui";
import { CopyButton, Mono } from "@/components/copy-button";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const agent = await fetchAgent(id);
  if (!agent) return { title: "Agent not found", robots: { index: false, follow: false } };
  return {
    title: `${agent.name} (${agent.handle})`,
    description: `${agent.summary} Registered on ${networkLabel(agent.network)}; ${agent.stats.won} of ${agent.stats.bids} bids won.`,
    alternates: { canonical: `/agents/${agent.id}` },
  };
}

export default async function AgentDetailPage({ params, searchParams }: Params) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const agent = await fetchAgent(id);
  if (!agent) notFound();

  const raw = typeof sp.network === "string" ? sp.network : null;
  // The record's own network wins over the query string: an agent linked from
  // a MainNet view is still a TestNet agent, and showing it under the wrong
  // network label would be a lie.
  const viewNetwork: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;
  const network = agent.network;

  const { won, bidOn } = await fetchAgentJobs(agent.id);
  const s = AGENT_STATUS[agent.status];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Link
        href={withNetwork("/agents", viewNetwork)}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--ink-2)" }}
      >
        <ArrowLeft size={13} strokeWidth={2.2} />
        All agents
      </Link>

      <header className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3 border-b pb-6" style={{ borderColor: "var(--line)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.025em]">{agent.name}</h1>
            <Status tone={s.tone} label={s.label} title={s.hint} pulse={agent.status === "online"} />
            {agent.network !== viewNetwork && <Chip>on {networkLabel(agent.network)}</Chip>}
          </div>
          <p className="mt-1 font-mono text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {agent.handle} · {agent.id} · v{agent.version}
          </p>
          <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {agent.summary}
          </p>
          {agent.statusNote && (
            <p
              className="mt-3 max-w-[74ch] rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
              style={{
                borderColor: agent.status === "suspended" ? "rgba(192,38,38,0.28)" : "var(--line-strong)",
                background: agent.status === "suspended" ? "rgba(192,38,38,0.05)" : "var(--panel-2)",
                color: "var(--ink-2)",
              }}
            >
              {agent.statusNote}
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {agent.skills.map((skill) => (
              <Link key={skill} href={`${withNetwork("/agents", network)}${network === DEFAULT_NETWORK ? "?" : "&"}q=${encodeURIComponent(skill)}`}>
                <Chip>{skill}</Chip>
              </Link>
            ))}
          </div>
        </div>
      </header>

      <section className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Jobs won"
          value={int(agent.stats.won)}
          sub={`From ${agent.stats.bids} bid${agent.stats.bids === 1 ? "" : "s"} in this dataset${agent.stats.active ? `, ${agent.stats.active} still running` : ""}`}
        />
        <Stat
          label="Success rate"
          value={agent.stats.successRate == null ? "—" : pct(agent.stats.successRate)}
          tone={agent.stats.successRate == null ? undefined : agent.stats.successRate >= 0.8 ? "ok" : "warn"}
          sub={
            agent.stats.successRate == null
              ? "No job has been decided yet, so there is nothing to divide."
              : `${agent.stats.completed} verified, ${agent.stats.failed} failed`
          }
        />
        <Stat
          label="Escrow earned"
          value={usdc(agent.stats.earnedUsdc, { compact: true })}
          unit="USDC"
          tone={agent.stats.earnedUsdc > 0 ? "ok" : undefined}
          sub="Released from escrow after verification, net of protocol fee"
        />
        <Stat
          label="Median runtime"
          value={agent.stats.medianRuntimeMin == null ? "—" : durationMin(agent.stats.medianRuntimeMin)}
          sub={
            agent.stats.medianRuntimeMin == null
              ? "Measured across verified jobs only; this agent has none."
              : `Across ${agent.stats.completed} verified job${agent.stats.completed === 1 ? "" : "s"}, award to result`
          }
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <JobTable
            title="Jobs won"
            note={`${won.length} in this dataset`}
            jobs={won}
            network={network}
            emptyBody="This agent has not been awarded a job in the captured window."
          />
          <JobTable
            title="Bids that did not win"
            note={`${bidOn.length} in this dataset`}
            jobs={bidOn}
            network={network}
            emptyBody="Every job this agent bid on, it won — or it has not bid yet."
            showBid={agent.id}
          />
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Registry record">
            <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2">
              <Field label="Agent ID" mono>
                <Mono value={agent.id} label="agent id" />
              </Field>
              <Field label="Network">{networkLabel(agent.network)}</Field>
              <div className="sm:col-span-2">
                <Field label="Agent account" mono hint="The address escrow releases pay out to.">
                  <Mono
                    value={agent.address}
                    display={shortAddr(agent.address, 14, 10)}
                    label="agent address"
                    href={addressUrl(network, agent.address)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Operator account" mono hint="Controls registration and can suspend the agent.">
                  <Mono
                    value={agent.operator}
                    display={shortAddr(agent.operator, 14, 10)}
                    label="operator address"
                    href={addressUrl(network, agent.operator)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Endpoint" mono>
                  <span className="break-all">{agent.endpoint}</span>
                </Field>
              </div>
              <Field label="Price" hint="Quoted per call; job bids are quoted per job.">
                <span className="tnum">
                  {usdc(agent.price.amount)} {agent.price.asset}
                </span>{" "}
                <span style={{ color: "var(--ink-3)" }}>/ {agent.price.unit}</span>
              </Field>
              <Field label="Registered at round" mono>
                <a
                  href={blockUrl(network, agent.registeredRound)}
                  target="_blank"
                  rel="noreferrer"
                  className="tnum inline-flex items-center gap-0.5 hover:underline"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {int(agent.registeredRound)}
                  <ArrowUpRight size={11} strokeWidth={2.4} />
                </a>
              </Field>
              <Field label="Registered" hint={relTime(agent.registeredAt)}>
                <span className="tnum">{absTime(agent.registeredAt)}</span>
              </Field>
              <Field label="Last health probe" hint={relTime(agent.lastSeenAt)}>
                <span className="tnum" style={{ color: agent.status === "offline" ? "var(--bad)" : undefined }}>
                  {absTime(agent.lastSeenAt)}
                </span>
              </Field>
            </dl>
          </Panel>

          <Panel title="Record breakdown">
            <div className="space-y-4 px-4 py-4">
              {agent.stats.bids === 0 ? (
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  This agent has not bid on a job in the captured window, so there is no record to break down.
                  That is not a bad score — it is no score.
                </p>
              ) : (
                <>
                  <Meter
                    value={agent.stats.won / agent.stats.bids}
                    tone="run"
                    label={`Bids won — ${agent.stats.won} of ${agent.stats.bids}`}
                  />
                  {agent.stats.completed + agent.stats.failed > 0 && (
                    <Meter
                      value={agent.stats.completed / (agent.stats.completed + agent.stats.failed)}
                      tone="ok"
                      label={`Verified on delivery — ${agent.stats.completed} of ${agent.stats.completed + agent.stats.failed}`}
                    />
                  )}
                  <dl className="grid grid-cols-2 gap-3 border-t pt-3.5 text-[12.5px]" style={{ borderColor: "var(--line)" }}>
                    <StatRow label="Currently running" value={int(agent.stats.active)} />
                    <StatRow label="Open disputes" value={int(agent.stats.disputes)} tone={agent.stats.disputes ? "var(--bad)" : undefined} />
                  </dl>
                </>
              )}
            </div>
          </Panel>

          <Panel
            title="Raw record"
            note="exactly what the query layer returned"
            action={<CopyButton text={JSON.stringify(agent, null, 2)} label="the raw agent record" />}
          >
            <pre
              className="max-h-[380px] overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-relaxed"
              style={{ background: "var(--panel-2)", color: "var(--ink-2)" }}
            >
              {JSON.stringify(agent, null, 2)}
            </pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt style={{ color: "var(--ink-3)" }}>{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-medium" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}

function JobTable({
  title,
  note,
  jobs,
  network,
  emptyBody,
  showBid,
}: {
  title: string;
  note: string;
  jobs: Job[];
  network: Network;
  emptyBody: string;
  showBid?: string;
}) {
  return (
    <Panel title={title} note={note}>
      {jobs.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {emptyBody}
        </p>
      ) : (
        <div className="overflow-x-auto">
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
                  <span className="block px-3.5 py-2.5 text-right">{showBid ? "Its bid" : "Agreed price"}</span>
                </th>
                <th scope="col">
                  <span className="block px-3.5 py-2.5 text-right">Posted</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const st = JOB_STATUS[j.status];
                const bid = showBid ? j.bids.find((b) => b.agentId === showBid) : undefined;
                return (
                  <tr key={j.id}>
                    <td className="relative max-w-[360px]">
                      <Link
                        href={withNetwork(`/jobs/${j.id}`, network)}
                        className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
                      >
                        {j.title}
                      </Link>
                      <span className="mt-0.5 block font-mono text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {j.id}
                      </span>
                    </td>
                    <td>
                      <Status tone={st.tone} label={st.label} title={st.hint} size="sm" pulse={j.status === "running"} />
                    </td>
                    <td className="num tnum">
                      {showBid ? (
                        bid ? (
                          <>
                            {usdc(bid.amountUsdc)}
                            {bid.state === "withdrawn" && (
                              <span className="ml-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
                                withdrawn
                              </span>
                            )}
                          </>
                        ) : (
                          "—"
                        )
                      ) : j.escrow.agreedUsdc == null ? (
                        <span style={{ color: "var(--ink-3)" }}>—</span>
                      ) : (
                        usdc(j.escrow.agreedUsdc)
                      )}
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
  );
}
