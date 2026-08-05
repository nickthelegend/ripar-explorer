import { NETWORK_LABEL } from "@/lib/registries";
import type { Metadata } from "next";
import Link from "next/link";
import {
  JOB_CANCELLED,
  JOB_DISPUTED,
  JOB_VALIDATED,
  REGISTRIES,
  SETTLEMENT_ASSET,
  TESTNET_ALGOD,
  getAppAssetBalance,
  getEscrows,
  getRegistryState,
  getTestnetRound,
  listAgents,
  listJobs,
  loraAddress,
  loraAsset,
  peraAddress,
  peraApp,
  tryRead,
  type OnchainAgent,
  type OnchainJob,
} from "@/lib/erc8004";
import { absTime, chainJobStatus, int, liveAgo, shortAddr, usdc } from "@/lib/format";
import { EmptyState, Panel, Stat, Status } from "@/components/ui";
import {
  ChainReadError,
  Out,
  PlainTh,
  RealChainBadge,
  RegistryTabs,
  TestNetBadge,
} from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Escrow",
  description:
    "Every job the Ripar ValidationRegistry is actually holding money against on Algorand TestNet, what is held, and the exact condition under which it is released or refunded. Read from es_ box storage.",
  alternates: { canonical: "/registry/escrow" },
};

// Escrow is created and destroyed by ordinary calls. Prerendering this would
// show money as held long after it was paid out.
export const dynamic = "force-dynamic";

const units = (micro: number) => micro / 10 ** SETTLEMENT_ASSET.decimals;

/**
 * The exact condition, per job, in the contract's own terms.
 *
 * Every clause is an `assert` in `release_escrow` or `refund_escrow`, not a
 * policy this page is describing from the outside.
 */
function conditions(
  job: OnchainJob,
  disputeWindow: number | null,
  assignee: OnchainAgent | null,
): { release: string; refund: string; who: string; tone: "ok" | "bad" | "warn" | "idle" } {
  switch (job.status) {
    case JOB_VALIDATED: {
      const closes = disputeWindow != null ? job.updatedAt + disputeWindow : null;
      const open = closes != null && Math.floor(Date.now() / 1000) <= closes;
      return {
        release: assignee
          ? `Payable now to agent #${job.serverAgentId} (${assignee.domain}) at ${shortAddr(assignee.address, 8, 6)}. The payee is resolved through the Identity Registry when the call runs, so it cannot be redirected by whoever triggers it.`
          : `The job names agent #${job.serverAgentId} as its assignee, but the Identity Registry has no ag_ box for that id — the contract resolves the payee the same way, so a release would fail.`,
        refund: "Not refundable. The verdict passed, and refund_escrow asserts the job is disputed or cancelled.",
        who: open
          ? `The client only, until ${closes != null ? absTime(new Date(closes * 1000).toISOString()) : "the dispute window closes"} — after that, anyone.`
          : "Anyone. The dispute window has closed, so the money cannot be held hostage by a validator or a client who never returns.",
        tone: "ok",
      };
    }
    case JOB_DISPUTED:
      return {
        release: "Not payable. release_escrow asserts a passing verdict, and this one failed.",
        refund: `Returns the whole balance to the client ${shortAddr(job.client, 8, 6)}. The destination is read off the job rather than from the sender.`,
        who: "Anyone. The contract puts no condition on who calls it, because the money can only go one place.",
        tone: "bad",
      };
    case JOB_CANCELLED:
      return {
        release: "Not payable. The job was withdrawn before anyone was assigned.",
        refund: `Returns the whole balance to the client ${shortAddr(job.client, 8, 6)}.`,
        who: "Anyone.",
        tone: "idle",
      };
    default:
      return {
        release: "Not yet. Nothing is payable until a validator passes the result.",
        refund: "Not yet. Nothing is refundable while the job is still live.",
        who: `Nobody — the job is ${chainJobStatus(job.status).label.toLowerCase()} and both escrow calls assert a terminal status.`,
        tone: "warn",
      };
  }
}

export default async function EscrowPage() {
  const [escrowRead, validationRead] = await Promise.all([
    tryRead(() => getEscrows()),
    tryRead(() => getRegistryState("validation", "escrow_asset")),
  ]);

  // A missing application answers its box list with an empty 200, so an empty
  // escrow map and an absent app look identical there. The application read is
  // what separates them, and it is checked first.
  const fatal = validationRead.error
    ? `Application ${REGISTRIES.validation.appId} did not answer: ${validationRead.error}`
    : escrowRead.error;

  const escrows = escrowRead.data ?? new Map<number, number>();

  const [jobs, agents, disputeState, holdings, round] = await Promise.all([
    listJobs().catch(() => [] as OnchainJob[]),
    listAgents().catch(() => [] as OnchainAgent[]),
    getRegistryState("validation", "dispute_window").catch(() => null),
    getAppAssetBalance(REGISTRIES.validation.appId, SETTLEMENT_ASSET.id).catch(() => null),
    getTestnetRound().catch(() => null),
  ]);

  const agentById = new Map(agents.map((a) => [a.agentId, a]));
  const jobById = new Map(jobs.map((j) => [j.jobId, j]));
  const disputeWindow = disputeState?.counter ?? null;

  const funded = [...escrows.entries()]
    .map(([jobId, micro]) => ({ jobId, micro, job: jobById.get(jobId) ?? null }))
    .sort((a, b) => b.micro - a.micro);

  const heldMicro = funded.reduce((sum, f) => sum + f.micro, 0);
  // What the boxes claim, against what the account can actually pay. These two
  // agreeing is the check; a page that shows only one cannot make it.
  const reconciles = holdings ? holdings.heldMicro >= heldMicro : null;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Escrow</h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every job the ValidationRegistry is holding money against, read from its{" "}
          <span className="font-mono text-[12px]">es_</span> boxes in app{" "}
          <Out href={peraApp(REGISTRIES.validation.appId)}>{REGISTRIES.validation.appId}</Out>. This list is
          exhaustive by construction: an <span className="font-mono text-[12px]">es_</span> box exists only
          while money is held, so the boxes that come back <em>are</em> the funded set and every job absent
          from it is holding nothing.
        </p>
        <RegistryTabs active="escrow" />
      </header>

      {fatal && <ChainReadError what="the escrow boxes" message={fatal} />}

      {!fatal && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Held right now"
              value={usdc(units(heldMicro))}
              unit={SETTLEMENT_ASSET.unitName}
              sub="summed from the es_ boxes, in base units divided by the asset's own six decimals"
              tone={heldMicro > 0 ? "info" : undefined}
            />
            <Stat
              label="Jobs funded"
              value={int(funded.length)}
              sub={
                funded.length === 0
                  ? "no es_ box exists on the app"
                  : `of ${int(jobs.length)} job${jobs.length === 1 ? "" : "s"} on the board`
              }
            />
            <Stat
              label="The app's own balance"
              value={holdings ? usdc(units(holdings.heldMicro)) : "unreadable"}
              unit={holdings ? SETTLEMENT_ASSET.unitName : undefined}
              sub={
                holdings == null
                  ? "the account read failed, so no claim is made about what it holds"
                  : !holdings.optedIn
                    ? "the app is not opted into the asset, so it could not hold it even in principle"
                    : reconciles
                      ? "at least what the boxes claim — the two agree"
                      : "LESS than the es_ boxes claim, which should be impossible and is shown rather than smoothed over"
              }
              tone={holdings != null && reconciles === false ? "bad" : undefined}
            />
            <Stat
              label="Dispute window"
              value={disputeWindow == null ? "unreadable" : int(disputeWindow)}
              unit={disputeWindow == null ? undefined : "seconds"}
              sub="after a passing verdict, before anyone at all may release"
            />
          </div>

          <Panel
            className="mt-5"
            title="Funded jobs"
            note={
              round
                ? `es_ boxes in app ${REGISTRIES.validation.appId} · read at ${NETWORK_LABEL} round ${int(round)}`
                : `es_ boxes in app ${REGISTRIES.validation.appId}`
            }
          >
            {funded.length === 0 ? (
              <EmptyState
                title="The contract is holding nothing"
                body={`The ValidationRegistry is deployed, readable, and has no es_ boxes at all. That is a true answer with two ordinary causes: no job has been funded, or every job that was has already paid out — the contract deletes the box before it sends, which is exactly what makes paying twice impossible. Posting a job commits no money, so a board full of budgets and an empty escrow list are perfectly consistent.`}
                action={
                  <Link
                    href="/registry/jobs"
                    className="rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
                    style={{ borderColor: "var(--line-strong)" }}
                  >
                    See the job board
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[1180px]">
                  <thead>
                    <tr>
                      <PlainTh width={76}>Job</PlainTh>
                      <PlainTh width={128}>Status</PlainTh>
                      <PlainTh align="right" width={126}>
                        Held
                      </PlainTh>
                      <PlainTh align="right" width={126}>
                        Budget
                      </PlainTh>
                      <PlainTh width={168}>Client</PlainTh>
                      <PlainTh width={230}>Released when</PlainTh>
                      <PlainTh width={230}>Refunded when</PlainTh>
                      <PlainTh width={120}>Funded at</PlainTh>
                    </tr>
                  </thead>
                  <tbody>
                    {funded.map(({ jobId, micro, job }) => {
                      if (!job) {
                        return (
                          <tr key={jobId}>
                            <td className="tnum font-medium">#{jobId}</td>
                            <td colSpan={7} style={{ color: "var(--ink-2)" }}>
                              An <span className="font-mono text-[12px]">es_{jobId}</span> box holds{" "}
                              <span className="tnum">{usdc(units(micro))}</span> {SETTLEMENT_ASSET.unitName},
                              but no <span className="font-mono text-[12px]">jb_{jobId}</span> box exists to
                              describe it. Shown rather than dropped: money held against a job the board cannot
                              see is the one thing worth surfacing loudest.
                            </td>
                          </tr>
                        );
                      }
                      const meta = chainJobStatus(job.status);
                      const assignee = job.serverAgentId ? (agentById.get(job.serverAgentId) ?? null) : null;
                      const c = conditions(job, disputeWindow, assignee);
                      return (
                        <tr key={jobId}>
                          <td className="tnum font-medium">
                            <Out
                              href={peraApp(REGISTRIES.validation.appId)}
                              title={`Box es_${jobId} in application ${REGISTRIES.validation.appId}`}
                            >
                              #{jobId}
                            </Out>
                          </td>
                          <td>
                            <Status tone={meta.tone} label={meta.label} title={meta.hint} size="sm" />
                          </td>
                          <td className="tnum text-right font-medium">
                            {usdc(units(micro))}{" "}
                            <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                              {SETTLEMENT_ASSET.unitName}
                            </span>
                          </td>
                          <td className="tnum text-right" style={{ color: "var(--ink-2)" }}>
                            {usdc(job.budgetUsdc)}
                            {micro < job.budgetMicro && (
                              <span className="block text-[11px]" style={{ color: "var(--warn)" }}>
                                {usdc(units(job.budgetMicro - micro))} short
                              </span>
                            )}
                          </td>
                          <td>
                            <Out href={peraAddress(job.client)} title={job.client}>
                              {shortAddr(job.client, 8, 6)}
                            </Out>
                          </td>
                          <td className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                            {c.release}
                          </td>
                          <td className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                            {c.refund}
                          </td>
                          <td className="text-[12.5px]" title={absTime(new Date(job.updatedAt * 1000).toISOString())}>
                            {liveAgo(job.updatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p
              className="border-t px-4 py-2.5 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Read the same bytes yourself, from a public node with no key and nothing of ours in the path:{" "}
              <Out href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}/boxes`}>
                {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}/boxes`}
              </Out>
            </p>
          </Panel>

          <Panel className="mt-5" title="What escrow is here, exactly">
            <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              <p>
                <strong style={{ color: "var(--ink)" }}>A budget is not escrow.</strong>{" "}
                <span className="font-mono text-[12px]">budget_micro</span> is a field on the job struct, and{" "}
                <span className="font-mono text-[12px]">post_job</span> moves nothing at all. Custody begins
                only when the client separately calls{" "}
                <span className="font-mono text-[12px]">fund_job</span>, and that is the only path by which app{" "}
                {REGISTRIES.validation.appId} takes an asset. So a job can show a budget and hold nothing, and
                the job board says so per row.
              </p>
              <p>
                <strong style={{ color: "var(--ink)" }}>
                  The amount is read off a transfer, not off an argument.
                </strong>{" "}
                <span className="font-mono text-[12px]">fund_job(axfer,uint64)</span> takes the payment as a
                transaction in its own atomic group. A group id is computed over every member, so the transfer
                cannot be omitted, reordered or replaced — which means the number the contract records is one
                the AVM has already validated rather than one the caller asserted.
              </p>
              <p>
                <strong style={{ color: "var(--ink)" }}>Money comes out one of two ways.</strong>{" "}
                <span className="font-mono text-[12px]">release_escrow</span> asserts the job is{" "}
                <em>validated</em> and pays the assignee, resolved through the Identity Registry at execution
                time.{" "}
                <span className="font-mono text-[12px]">refund_escrow</span> asserts the job is{" "}
                <em>disputed</em> or <em>cancelled</em> and pays the client, whose address is read off the job
                rather than taken from the sender — so triggering a refund can never redirect one. There is no
                third path, and no partial release on this deployment.
              </p>
              <p>
                <strong style={{ color: "var(--ink)" }}>
                  The client is not the only one who can release.
                </strong>{" "}
                {disputeWindow == null ? (
                  <>
                    After the dispute window — which could not be read just now, so no figure is quoted —
                    anyone may call <span className="font-mono text-[12px]">release_escrow</span>.
                  </>
                ) : (
                  <>
                    After <span className="tnum">{int(disputeWindow)}</span> seconds from the verdict, anyone
                    may call <span className="font-mono text-[12px]">release_escrow</span>.
                  </>
                )}{" "}
                A validator or a client who never returns would otherwise freeze the worker&rsquo;s money for
                good, and a lock with no key is not escrow, it is confiscation.
              </p>
              <p>
                <strong style={{ color: "var(--ink)" }}>Paying twice is impossible by ordering.</strong> The box
                is deleted <em>before</em> the transfer is submitted. Clearing it afterwards would leave the
                ledger claiming money the app no longer intends to hold if the transfer failed; clearing it
                first means a second call finds nothing to send.
              </p>
              <p>
                {holdings ? (
                  <>
                    Escrow is denominated in{" "}
                    <Out href={loraAsset(SETTLEMENT_ASSET.id)}>
                      {SETTLEMENT_ASSET.unitName} · {SETTLEMENT_ASSET.id}
                    </Out>{" "}
                    and lives in the app&rsquo;s own account{" "}
                    <Out href={loraAddress(holdings.address)} title={holdings.address}>
                      {shortAddr(holdings.address, 8, 6)}
                    </Out>
                    , which currently holds{" "}
                    <span className="tnum font-medium" style={{ color: "var(--ink)" }}>
                      {usdc(units(holdings.heldMicro))} {SETTLEMENT_ASSET.unitName}
                    </span>
                    . That balance is checkable by anyone and is the reason the tile above can compare it
                    against what the boxes claim.
                  </>
                ) : (
                  <>
                    The app account&rsquo;s balance could not be read just now, so no claim is made about it.
                    The per-job <span className="font-mono text-[12px]">es_</span> boxes above came from algod
                    and stand on their own.
                  </>
                )}
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
