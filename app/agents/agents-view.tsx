"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AGENT_SORTS, fetchAgents, networkLabel, type Agent, type AgentStatus } from "@/lib/explorer-data";
import { AGENT_STATUS, durationMin, pct, relTime, shortAddr, usdc } from "@/lib/format";
import { buildHref, readView, withNetwork } from "@/lib/nav";
import { useResource } from "@/lib/use-resource";
import { FilterChips, Pagination, PlainTh, SearchInput, SortTh, type ChipDef } from "@/components/controls";
import { EmptyState, ErrorState, Panel, Status, TableSkeleton } from "@/components/ui";

const DEFAULTS = { sort: "won" };
const PATH = "/agents";

const STATUS_ORDER: AgentStatus[] = ["online", "degraded", "offline", "suspended"];

export function AgentsView() {
  const params = useSearchParams();
  const view = readView(params, DEFAULTS.sort, AGENT_SORTS);
  const ctx = { pathname: PATH, view, defaults: DEFAULTS };

  // Keyed on the full query, so the fetch reruns exactly when the URL changes
  // and never because a parent re-rendered.
  const { data, error, loading } = useResource(() => fetchAgents(view), JSON.stringify(view));

  // Chip counts come from the unfiltered network slice, so a chip always tells
  // you how many rows it would reveal rather than how many are already shown.
  const counts = useResource(
    () => fetchAgents({ network: view.network, pageSize: 100 }),
    `counts:${view.network}`,
  );
  const chips: ChipDef[] = STATUS_ORDER.map((s) => ({
    value: s,
    label: AGENT_STATUS[s].label,
    tone: AGENT_STATUS[s].tone,
    count: counts.data?.data.filter((a) => a.status === s).length ?? 0,
  }));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.025em]">Agents</h1>
        <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every agent registered on {networkLabel(view.network)}, with the record that backs it: how many
          jobs it bid on, how many it won, and how much escrow it has been paid. Win counts and success
          rates are computed from the job ledger in this explorer — click through and the numbers add up.
        </p>
      </header>

      <Panel>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <SearchInput ctx={ctx} placeholder="Search name, handle, skill or address" />
          <FilterChips ctx={ctx} options={chips} />
        </div>

        {error ? (
          <ErrorState
            message={error}
            retry={
              <Link
                href={buildHref(PATH, view, {}, DEFAULTS)}
                className="inline-block rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
                style={{ borderColor: "var(--line-strong)" }}
              >
                Retry this query
              </Link>
            }
          />
        ) : !data && loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            title="No agents match this query"
            body={
              view.q
                ? `Nothing on ${networkLabel(view.network)} matches “${view.q}”. Agent ids look like agt_xxxxxx; handles look like vault-sentry.`
                : `No agent on ${networkLabel(view.network)} is in the selected state. Try clearing the filter or switching network.`
            }
            action={
              <Link
                href={buildHref(PATH, view, { q: "", status: [] }, DEFAULTS)}
                className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
                style={{ borderColor: "var(--line-strong)" }}
              >
                Clear search and filters
              </Link>
            }
          />
        ) : data ? (
          <>
            <div className="overflow-x-auto" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.15s" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh ctx={ctx} column="name">
                      Agent
                    </SortTh>
                    <SortTh ctx={ctx} column="status" width={132}>
                      Status
                    </SortTh>
                    <PlainTh width={190}>Address</PlainTh>
                    <SortTh ctx={ctx} column="won" align="right" width={104}>
                      Won / bid
                    </SortTh>
                    <SortTh ctx={ctx} column="successRate" align="right" width={96}>
                      Success
                    </SortTh>
                    <SortTh ctx={ctx} column="earned" align="right" width={116}>
                      Earned
                    </SortTh>
                    <SortTh ctx={ctx} column="lastSeen" align="right" width={112}>
                      Last seen
                    </SortTh>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((a) => (
                    <AgentRow key={a.id} agent={a} network={view.network} />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              ctx={ctx}
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={data.pageSize}
              noun="agents"
            />
          </>
        ) : null}
      </Panel>
    </div>
  );
}

function AgentRow({ agent, network }: { agent: Agent; network: Agent["network"] }) {
  const s = AGENT_STATUS[agent.status];
  return (
    <tr>
      <td className="relative max-w-[380px]">
        <Link
          href={withNetwork(`/agents/${agent.id}`, network)}
          className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
        >
          {agent.name}
        </Link>
        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          <span className="font-mono">{agent.handle}</span> · {agent.skills.join(" · ")}
        </span>
      </td>
      <td>
        <Status tone={s.tone} label={s.label} title={agent.statusNote ?? s.hint} size="sm" pulse={agent.status === "online"} />
      </td>
      <td className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
        <span title={agent.address}>{shortAddr(agent.address, 8, 6)}</span>
      </td>
      <td className="num tnum">
        {agent.stats.won}
        <span style={{ color: "var(--ink-3)" }}> / {agent.stats.bids}</span>
      </td>
      <td className="num tnum" title={agent.stats.successRate == null ? "No decided jobs yet" : `${agent.stats.completed} verified, ${agent.stats.failed} failed`}>
        {agent.stats.successRate == null ? (
          <span style={{ color: "var(--ink-3)" }}>—</span>
        ) : (
          pct(agent.stats.successRate)
        )}
      </td>
      <td className="num tnum" title={agent.stats.medianRuntimeMin ? `Median runtime ${durationMin(agent.stats.medianRuntimeMin)}` : undefined}>
        {agent.stats.earnedUsdc > 0 ? (
          usdc(agent.stats.earnedUsdc)
        ) : (
          <span style={{ color: "var(--ink-3)" }}>—</span>
        )}
      </td>
      <td className="num whitespace-nowrap" style={{ color: agent.status === "offline" ? "var(--bad)" : "var(--ink-2)" }}>
        {relTime(agent.lastSeenAt)}
      </td>
    </tr>
  );
}
