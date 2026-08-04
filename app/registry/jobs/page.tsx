import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import {
  JOB_ASSIGNED,
  JOB_CANCELLED,
  JOB_DISPUTED,
  JOB_OPEN,
  JOB_SUBMITTED,
  JOB_VALIDATED,
  READ_LIMIT,
  REGISTRIES,
  TESTNET_ALGOD,
  getRegistryState,
  getTestnetRound,
  listAgents,
  listJobs,
  peraAddress,
  peraApp,
  tryRead,
  type OnchainAgent,
  type OnchainJob,
} from "@/lib/erc8004";
import { CHAIN_JOB_STATUS, absTime, chainJobStatus, int, liveAgo, shortAddr, usdc } from "@/lib/format";
import { EmptyState, Panel, Stat, Status } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import {
  ChainReadError,
  Out,
  PlainTh,
  RealChainBadge,
  RegistryTabs,
  SortTh,
  TestNetBadge,
} from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Onchain job board",
  description:
    "Ripar's ERC-8004 Validation Registry on Algorand TestNet: every job posted onchain, its status through open, assigned, submitted, validated or disputed, its budget, its spec hash and the agent it was assigned to.",
  alternates: { canonical: "/registry/jobs" },
};

// The board changes as jobs are assigned and judged. Prerendering it would show
// a job as open long after it settled.
export const dynamic = "force-dynamic";

const SORTS = ["id", "status", "budget", "posted"] as const;
type Sort = (typeof SORTS)[number];

/** Statuses in lifecycle order, which is also the order the filter reads in. */
const STATUS_ORDER = [
  JOB_OPEN,
  JOB_ASSIGNED,
  JOB_SUBMITTED,
  JOB_VALIDATED,
  JOB_DISPUTED,
  JOB_CANCELLED,
] as const;

const IN_FLIGHT = new Set<number>([JOB_ASSIGNED, JOB_SUBMITTED]);

function sortJobs(jobs: OnchainJob[], sort: Sort, dir: "asc" | "desc"): OnchainJob[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (j: OnchainJob) =>
    sort === "status" ? j.status : sort === "budget" ? j.budgetMicro : sort === "posted" ? j.createdAt : j.jobId;
  return [...jobs].sort((a, b) => sign * (key(a) - key(b)) || b.jobId - a.jobId);
}

/** Hex is unreadable at full width and meaningless truncated in the middle. */
const shortHash = (hex: string) => `${hex.slice(0, 10)}…${hex.slice(-6)}`;

export default async function RegistryJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawSort = typeof sp.sort === "string" ? sp.sort : "";
  const sort: Sort = (SORTS as readonly string[]).includes(rawSort) ? (rawSort as Sort) : "id";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const rawStatus = typeof sp.status === "string" ? Number.parseInt(sp.status, 10) : NaN;
  const status = STATUS_ORDER.includes(rawStatus as (typeof STATUS_ORDER)[number]) ? rawStatus : null;

  const rawAgent = typeof sp.agent === "string" ? Number.parseInt(sp.agent, 10) : NaN;
  const agentFilter = Number.isFinite(rawAgent) && rawAgent > 0 ? rawAgent : null;

  const [jobsRead, validationRead] = await Promise.all([
    tryRead(() => listJobs()),
    tryRead(() => getRegistryState("validation", "job_count")),
  ]);

  // A missing application answers its box list with an empty 200, so an empty
  // board and an absent one look identical there. The application read is what
  // separates them, and it is checked first.
  const fatal = validationRead.error
    ? `Application ${REGISTRIES.validation.appId} did not answer: ${validationRead.error}`
    : jobsRead.error;

  const jobs = jobsRead.data ?? [];
  const validationState = validationRead.data;

  // Agent ids on their own are opaque. Resolving them against the Identity
  // Registry is what turns "assigned to 1" into a name a reader can check.
  const [agents, round] = await Promise.all([
    listAgents().catch(() => [] as OnchainAgent[]),
    getTestnetRound().catch(() => null),
  ]);
  const agentById = new Map(agents.map((a) => [a.agentId, a]));

  const filtered = jobs.filter(
    (j) => (status == null || j.status === status) && (agentFilter == null || j.serverAgentId === agentFilter),
  );
  const shown = sortJobs(filtered, sort, dir);

  const counts = new Map(STATUS_ORDER.map((s) => [s as number, jobs.filter((j) => j.status === s).length]));
  const committed = jobs
    .filter((j) => j.status !== JOB_CANCELLED)
    .reduce((sum, j) => sum + j.budgetUsdc, 0);

  const buildHref = (patch: { sort?: Sort; dir?: "asc" | "desc"; status?: number | null; agent?: number | null }) => {
    const nextSort = patch.sort ?? sort;
    const nextDir = patch.dir ?? (patch.sort ? "desc" : dir);
    const nextStatus = patch.status === undefined ? status : patch.status;
    const nextAgent = patch.agent === undefined ? agentFilter : patch.agent;
    const qs = new URLSearchParams();
    if (nextSort !== "id") qs.set("sort", nextSort);
    if (nextDir !== "desc") qs.set("dir", nextDir);
    if (nextStatus != null) qs.set("status", String(nextStatus));
    if (nextAgent != null) qs.set("agent", String(nextAgent));
    const q = qs.toString();
    return q ? `/registry/jobs?${q}` : "/registry/jobs";
  };

  const sortHref = (col: Sort) => buildHref({ sort: col, dir: col === sort && dir === "desc" ? "asc" : "desc" });

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Onchain job board</h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every job below is a <span className="font-mono text-[12px]">jb_</span> box in the Validation
          Registry, app <Out href={peraApp(REGISTRIES.validation.appId)}>{REGISTRIES.validation.appId}</Out>,
          decoded from its ARC-4 struct. The specification and the delivered result stay offchain; what the
          chain carries is their sha256 hashes, the budget, and who was assigned.
        </p>
        <RegistryTabs active="jobs" />
      </header>

      {fatal && <ChainReadError what="the Validation Registry" message={fatal} />}

      {!fatal && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Box count and `job_count` answer different questions: what is on
                the board now, versus how many ids have ever been issued. */}
            <Stat
              label="Jobs posted"
              value={int(jobs.length)}
              sub={`jb_ boxes on the board${
                validationState?.counter != null ? ` · job_count has reached ${int(validationState.counter)}` : ""
              }`}
            />
            <Stat
              label="Open"
              value={int(counts.get(JOB_OPEN) ?? 0)}
              sub="posted, unassigned, still cancellable"
              tone={counts.get(JOB_OPEN) ? "info" : undefined}
            />
            <Stat
              label="In flight"
              value={int(jobs.filter((j) => IN_FLIGHT.has(j.status)).length)}
              sub="assigned or awaiting a verdict"
            />
            <Stat
              label="Budget committed"
              value={usdc(committed)}
              unit="USDC"
              sub="every job except the cancelled ones"
            />
          </div>

          <Panel
            className="mt-5"
            title="Jobs"
            note={
              round
                ? `app ${REGISTRIES.validation.appId} · read at TestNet round ${int(round)}`
                : `app ${REGISTRIES.validation.appId}`
            }
          >
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-4 py-3"
              style={{ borderColor: "var(--line)" }}
            >
              <Link
                href={buildHref({ status: null })}
                aria-pressed={status == null}
                className="rounded-md border px-2 py-1 text-[12px] font-medium"
                style={
                  status == null
                    ? { borderColor: "var(--accent-deep)", color: "var(--accent-deep)", background: "var(--wash)" }
                    : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
                }
              >
                All {int(jobs.length)}
              </Link>
              {STATUS_ORDER.map((s) => {
                const meta = CHAIN_JOB_STATUS[s];
                const on = status === s;
                return (
                  <Link
                    key={s}
                    href={buildHref({ status: on ? null : s })}
                    aria-pressed={on}
                    title={meta.hint}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium"
                    style={
                      on
                        ? { borderColor: "var(--accent-deep)", color: "var(--accent-deep)", background: "var(--wash)" }
                        : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
                    }
                  >
                    {meta.label}
                    <span className="tnum" style={{ color: "var(--ink-3)" }}>
                      {int(counts.get(s) ?? 0)}
                    </span>
                  </Link>
                );
              })}

              {agentFilter != null && (
                <Link
                  href={buildHref({ agent: null })}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium"
                  style={{ borderColor: "var(--accent-deep)", color: "var(--accent-deep)", background: "var(--wash)" }}
                >
                  Assigned to agent #{agentFilter}
                  <X size={12} strokeWidth={2.4} aria-hidden />
                  <span className="sr-only">Clear the agent filter</span>
                </Link>
              )}
            </div>

            {jobs.length === 0 ? (
              <EmptyState
                title="No jobs have been posted yet"
                body="The Validation Registry is deployed and readable, and it holds no jb_ boxes. An empty board is a true answer — the first post_job call will appear here."
              />
            ) : shown.length === 0 ? (
              <EmptyState
                title="No job matches this filter"
                body={
                  agentFilter != null && status != null
                    ? `Nothing on the board is both in the selected state and assigned to agent #${agentFilter}.`
                    : agentFilter != null
                      ? `No job on the board is assigned to agent #${agentFilter}. Ids are not reused, so this one may simply never have been given work.`
                      : "No job on the board is in the selected state."
                }
                action={
                  <Link
                    href="/registry/jobs"
                    className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
                    style={{ borderColor: "var(--line-strong)" }}
                  >
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[1140px]">
                  <thead>
                    <tr>
                      <SortTh href={sortHref("id")} active={sort === "id"} dir={dir} width={76}>
                        Job id
                      </SortTh>
                      <SortTh href={sortHref("status")} active={sort === "status"} dir={dir} width={140}>
                        Status
                      </SortTh>
                      <SortTh href={sortHref("budget")} active={sort === "budget"} dir={dir} align="right" width={124}>
                        Budget
                      </SortTh>
                      <PlainTh width={176}>Assigned to</PlainTh>
                      <PlainTh width={140}>Validator</PlainTh>
                      <PlainTh width={168}>Client</PlainTh>
                      <PlainTh width={172}>Spec hash</PlainTh>
                      <PlainTh width={172}>Result hash</PlainTh>
                      <SortTh href={sortHref("posted")} active={sort === "posted"} dir={dir} align="right" width={116}>
                        Posted
                      </SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((job) => {
                      const meta = chainJobStatus(job.status);
                      const assignee = job.serverAgentId ? agentById.get(job.serverAgentId) : undefined;
                      const validator = job.validatorAgentId ? agentById.get(job.validatorAgentId) : undefined;
                      return (
                        <tr key={job.jobId}>
                          {/* A job id is Ripar's, not Algorand's. The nearest
                              thing an explorer can open is the app holding it. */}
                          <td className="tnum font-medium">
                            <Out
                              href={peraApp(REGISTRIES.validation.appId)}
                              title={`Box jb_${job.jobId} in application ${REGISTRIES.validation.appId}`}
                            >
                              #{job.jobId}
                            </Out>
                          </td>
                          <td>
                            <Status tone={meta.tone} label={meta.label} title={meta.hint} size="sm" />
                          </td>
                          <td className="tnum text-right">
                            {usdc(job.budgetUsdc)}{" "}
                            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              USDC
                            </span>
                          </td>
                          <td>
                            {job.serverAgentId === 0 ? (
                              <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                                unassigned
                              </span>
                            ) : (
                              <Link
                                href={`/registry#agent-${job.serverAgentId}`}
                                className="text-[12.5px] font-medium underline-offset-2 hover:underline"
                                style={{ color: "var(--accent-deep)" }}
                                title={assignee ? assignee.domain : "This id has no box in the Identity Registry"}
                              >
                                agent #{job.serverAgentId}
                                {assignee && (
                                  <span
                                    className="block truncate font-mono text-[11px]"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    {assignee.domain}
                                  </span>
                                )}
                              </Link>
                            )}
                          </td>
                          {/* 0 is not "missing" — it is the contract's way of
                              saying the client judges its own job. */}
                          <td>
                            {job.validatorAgentId === 0 ? (
                              <span className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                                client judges
                              </span>
                            ) : (
                              <Link
                                href={`/registry#agent-${job.validatorAgentId}`}
                                className="text-[12.5px] font-medium underline-offset-2 hover:underline"
                                style={{ color: "var(--accent-deep)" }}
                                title={validator ? validator.domain : "This id has no box in the Identity Registry"}
                              >
                                agent #{job.validatorAgentId}
                              </Link>
                            )}
                          </td>
                          <td>
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Out href={peraAddress(job.client)} title={job.client}>
                                {shortAddr(job.client, 8, 6)}
                              </Out>
                              <CopyButton text={job.client} label="client address" />
                            </span>
                          </td>
                          <td>
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-mono text-[12px]" title={`sha256 ${job.specHash}`}>
                                {shortHash(job.specHash)}
                              </span>
                              <CopyButton text={job.specHash} label="spec hash" />
                            </span>
                          </td>
                          <td>
                            {job.resultHash ? (
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-mono text-[12px]" title={`sha256 ${job.resultHash}`}>
                                  {shortHash(job.resultHash)}
                                </span>
                                <CopyButton text={job.resultHash} label="result hash" />
                              </span>
                            ) : (
                              <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                                not submitted
                              </span>
                            )}
                          </td>
                          <td className="text-right">
                            <span
                              className="text-[12.5px]"
                              title={`Posted ${absTime(new Date(job.createdAt * 1000).toISOString())} · last change ${absTime(
                                new Date(job.updatedAt * 1000).toISOString(),
                              )}`}
                            >
                              {liveAgo(job.createdAt)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {jobs.length >= READ_LIMIT && (
              <p className="border-t px-4 py-2.5 text-[12px]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                Showing the first {READ_LIMIT} jobs. Each box is its own request, so the page reads a bounded
                slice rather than an unbounded one.
              </p>
            )}
            {/* The whole read, in one line someone can paste into a terminal. */}
            <p
              className="border-t px-4 py-2.5 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Every row above was decoded from one box. Read the same bytes yourself, from a public node with
              no key and nothing of ours in the path:{" "}
              <Out href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}/boxes`}>
                {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}/boxes`}
              </Out>
            </p>
          </Panel>

          <Panel className="mt-5" title="How a job moves">
            <div className="px-4 py-4">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
                {[JOB_OPEN, JOB_ASSIGNED, JOB_SUBMITTED].map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <Status tone={CHAIN_JOB_STATUS[s].tone} label={CHAIN_JOB_STATUS[s].label} size="sm" />
                    <span aria-hidden style={{ color: "var(--ink-3)" }}>
                      →
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <Status tone="ok" label="Validated" size="sm" />
                  <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    or
                  </span>
                  <Status tone="bad" label="Disputed" size="sm" />
                </li>
              </ol>

              <dl className="mt-4 grid gap-x-8 gap-y-3 text-[13px] leading-relaxed sm:grid-cols-2">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className="flex gap-2">
                    <dt className="flex-none pt-[1px]">
                      <Status tone={CHAIN_JOB_STATUS[s].tone} label={CHAIN_JOB_STATUS[s].label} size="sm" />
                    </dt>
                    <dd style={{ color: "var(--ink-2)" }}>{CHAIN_JOB_STATUS[s].hint}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 max-w-[92ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                The transitions are enforced onchain, not by this page: only the client may assign or cancel,
                only an open job can be cancelled, only an assigned job accepts a result, and only a submitted
                result can be judged. A verdict is terminal — there is no path back out of validated or
                disputed, which is what makes a dispute worth recording.
              </p>
              <p className="mt-3 max-w-[92ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                <strong style={{ color: "var(--ink)" }}>The budget is a figure, not a deposit.</strong>{" "}
                The Validation Registry never takes custody of anyone&rsquo;s USDC — the client holds it until
                it releases it — so &ldquo;budget committed&rdquo; above is the sum of what jobs say they are
                worth, not a balance held by app {REGISTRIES.validation.appId}. Payment, when it happens,
                settles over x402 and is what the{" "}
                <Link href="/registry" className="underline-offset-2 hover:underline" style={{ color: "var(--accent-deep)" }}>
                  Reputation Registry
                </Link>{" "}
                counts.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
