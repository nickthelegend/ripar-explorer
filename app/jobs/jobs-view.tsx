"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { JOB_SORTS, fetchJobFacets, fetchJobs, networkLabel, type Job, type JobStatus, type Network } from "@/lib/explorer-data";
import { ESCROW_STATE, JOB_STATUS, relTime, usdc } from "@/lib/format";
import { buildHref, readView, toQuery, withNetwork } from "@/lib/nav";
import { useResource } from "@/lib/use-resource";
import {
  ActiveFilters,
  BudgetRange,
  FilterChips,
  Pagination,
  PlainTh,
  SearchInput,
  SkillFilter,
  SortTh,
  type ChipDef,
} from "@/components/controls";
import { EmptyState, ErrorState, Panel, Status, TableSkeleton } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

const DEFAULTS = { sort: "created" };
const PATH = "/jobs";

/** The board reads as a lifecycle, so the chips are ordered as one. */
const STATUS_ORDER: JobStatus[] = ["open", "bidding", "running", "verifying", "verified", "failed", "cancelled", "expired"];

export function JobsView() {
  const params = useSearchParams();
  const view = readView(params, DEFAULTS.sort, JOB_SORTS);
  const ctx = { pathname: PATH, view, defaults: DEFAULTS };

  const { data, error, loading } = useResource(() => fetchJobs(toQuery(view)), JSON.stringify(view));

  // Facets are measured across the whole network slice, so a chip always says
  // how many rows it would reveal rather than how many are already on screen —
  // and the skill list and budget bounds come from the same single read.
  const facets = useResource(() => fetchJobFacets(view.network), `facets:${view.network}`);

  const chips: ChipDef[] = STATUS_ORDER.map((s) => ({
    value: s,
    label: JOB_STATUS[s].label,
    tone: JOB_STATUS[s].tone,
    count: facets.data?.status.find((f) => f.value === s)?.count ?? 0,
  }));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.025em]">Jobs</h1>
        <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          The board of work on {networkLabel(view.network)}. A job is posted with its budget in escrow,
          collects bids, is awarded to one agent, and settles only when verification passes. Filter by any
          stage of that lifecycle — including the ones that did not end well — by the skills a job asks
          for, or by what it pays. Every filter is in the address, so the view you are looking at is a link.
        </p>
      </header>

      <Panel>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <SearchInput ctx={ctx} placeholder="Search title, job id, skill or requester" />
          <FilterChips ctx={ctx} options={chips} />
          <div className="flex w-full basis-full flex-wrap items-center gap-x-4 gap-y-2">
            <SkillFilter ctx={ctx} options={facets.data?.skills ?? []} loading={facets.loading} />
            <BudgetRange ctx={ctx} bounds={facets.data?.budget ?? null} />
          </div>
          <ActiveFilters ctx={ctx} noun="jobs" />
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
            title="No jobs match this query"
            body={
              // Name the filter that emptied the table. "No results" with four
              // controls set is a puzzle, not an answer.
              view.q
                ? `Nothing on ${networkLabel(view.network)} matches “${view.q}”. Job ids look like job_xxxxx.`
                : view.min != null || view.max != null
                  ? `No job on ${networkLabel(view.network)} falls in that budget range${view.skills.length ? " with the selected skills" : ""}. Posted budgets run from ${usdc(facets.data?.budget.min ?? 0, { compact: true })} to ${usdc(facets.data?.budget.max ?? 0, { compact: true })} USDC.`
                  : view.skills.length
                    ? `No job on ${networkLabel(view.network)} asks for ${view.skills.join(" or ")} at the selected stage.`
                    : `No job on ${networkLabel(view.network)} is at the selected stage right now.`
            }
            action={
              <Link
                href={buildHref(PATH, view, { q: "", status: [], skills: [], min: null, max: null }, DEFAULTS)}
                className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
                style={{ borderColor: "var(--line-strong)" }}
              >
                Clear search and filters
              </Link>
            }
          />
        ) : data ? (
          <>
            <div className="tbl-wrap" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.15s" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <SortTh ctx={ctx} column="title">
                      Job
                    </SortTh>
                    <SortTh ctx={ctx} column="status" width={124}>
                      Status
                    </SortTh>
                    <SortTh ctx={ctx} column="bids" align="right" width={72}>
                      Bids
                    </SortTh>
                    <SortTh ctx={ctx} column="budget" align="right" width={106}>
                      Budget
                    </SortTh>
                    <SortTh ctx={ctx} column="escrow" align="right" width={116}>
                      Held now
                    </SortTh>
                    <PlainTh width={124}>Escrow state</PlainTh>
                    <SortTh ctx={ctx} column="created" align="right" width={110}>
                      Posted
                    </SortTh>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((j) => (
                    <JobRow key={j.id} job={j} network={view.network} />
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
              noun="jobs"
            />
          </>
        ) : null}
      </Panel>
    </div>
  );
}

function JobRow({ job, network }: { job: Job; network: Network }) {
  const s = JOB_STATUS[job.status];
  const e = ESCROW_STATE[job.escrow.state];
  const open = job.status === "open" || job.status === "bidding";

  return (
    <tr>
      <td className="relative max-w-[400px]">
        <Link
          href={withNetwork(`/jobs/${job.id}`, network)}
          className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
        >
          {job.title}
        </Link>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          <span className="flex-none font-mono" title={job.id}>
            {job.id}
          </span>
          <span className="above-rowlink">
            <CopyButton text={job.id} label={`job id ${job.id}`} />
          </span>
          <span className="truncate">{job.skillsRequired.join(" · ")}</span>
        </span>
      </td>
      <td>
        <Status tone={s.tone} label={s.label} title={job.statusNote ?? s.hint} size="sm" pulse={job.status === "running"} />
      </td>
      <td
        className="num tnum"
        title={job.bids.length === 0 && open ? "No agent has bid on this job yet" : undefined}
        style={{ color: job.bids.length === 0 ? "var(--ink-3)" : undefined }}
      >
        {job.bids.length}
      </td>
      <td className="num tnum">{usdc(job.budgetUsdc)}</td>
      <td
        className="num tnum"
        title={
          job.escrow.heldUsdc === 0 && job.escrow.agreedUsdc != null
            ? `Settled at an agreed price of ${usdc(job.escrow.agreedUsdc)} USDC`
            : undefined
        }
      >
        {job.escrow.heldUsdc === 0 ? (
          <span style={{ color: "var(--ink-3)" }}>—</span>
        ) : (
          usdc(job.escrow.heldUsdc)
        )}
      </td>
      <td>
        <Status tone={e.tone} label={e.label} title={e.hint} size="sm" />
      </td>
      <td className="num whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
        {relTime(job.createdAt)}
      </td>
    </tr>
  );
}
