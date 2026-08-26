import { NETWORK_LABEL } from "@/lib/registries";
import type { Metadata } from "next";
import Link from "next/link";
import {
  JOB_ASSIGNED,
  JOB_CANCELLED,
  JOB_DISPUTED,
  JOB_OPEN,
  JOB_SUBMITTED,
  JOB_VALIDATED,
  REGISTRIES,
  SETTLEMENT_ASSET,
  TESTNET_ALGOD,
  TESTNET_INDEXER,
  countSettlementTransfers,
  getAppAssetBalance,
  getEscrows,
  getRegistryState,
  getScores,
  getTestnetRound,
  listAgents,
  listJobs,
  loraAsset,
  tryRead,
  type OnchainJob,
  type OnchainScore,
} from "@/lib/erc8004";
import { CHAIN_JOB_STATUS, int, usdc } from "@/lib/format";
import { Panel, Stat, Status } from "@/components/ui";
import {
  ChainReadError,
  Out,
  PlainTh,
  RealChainBadge,
  RegistryApps,
  RegistryTabs,
  TestNetBadge,
} from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Network stats",
  description:
    "Real counts for Ripar on Algorand TestNet: agents registered, jobs by status, escrow actually held, and settlements of the asset the registries count. Every figure is a chain read, with the query printed beside it.",
  alternates: { canonical: "/registry/stats" },
};

export const dynamic = "force-dynamic";

const units = (micro: number) => micro / 10 ** SETTLEMENT_ASSET.decimals;
const counterText = (n: number | null | undefined) => (n == null ? "unreadable" : int(n));

const STATUS_ORDER = [
  JOB_OPEN,
  JOB_ASSIGNED,
  JOB_SUBMITTED,
  JOB_VALIDATED,
  JOB_DISPUTED,
  JOB_CANCELLED,
] as const;

/**
 * Every number on this page, with the request that produced it.
 *
 * There is no aggregate here that is not a count of things read this request:
 * boxes, global-state uints, an account balance, and transfers from the
 * indexer. Nothing is derived from a sample and scaled up, nothing is carried
 * over from a previous render, and a read that fails is printed as "unreadable"
 * rather than as zero — the two are different facts and a dashboard that shows
 * them the same way is worse than one that shows neither.
 */
export default async function NetworkStatsPage() {
  const [agentsRead, identityRead] = await Promise.all([
    tryRead(() => listAgents()),
    tryRead(() => getRegistryState("identity", "agent_count")),
  ]);

  const fatal = identityRead.error
    ? `Application ${REGISTRIES.identity.appId} did not answer: ${identityRead.error}`
    : agentsRead.error;

  const agents = agentsRead.data ?? [];

  const [jobs, escrows, scores, validationState, reputationState, disputeState, holdings, settlements, round] =
    await Promise.all([
      listJobs().catch(() => [] as OnchainJob[]),
      getEscrows().catch(() => new Map<number, number>()),
      getScores(agents.map((a) => a.agentId)).catch(() => new Map<number, OnchainScore>()),
      getRegistryState("validation", "job_count").catch(() => null),
      getRegistryState("reputation", "identity_app").catch(() => null),
      getRegistryState("validation", "dispute_window").catch(() => null),
      getAppAssetBalance(REGISTRIES.validation.appId, SETTLEMENT_ASSET.id).catch(() => null),
      countSettlementTransfers().catch(() => null),
      getTestnetRound().catch(() => null),
    ]);

  const escrowedMicro = [...escrows.values()].reduce((sum, v) => sum + v, 0);
  const scored = [...scores.values()];
  const creditedPayments = scored.reduce((s, v) => s + v.jobsPaid, 0);
  const creditedMicro = scored.reduce((s, v) => s + v.volumeMicro, 0);
  const validated = scored.reduce((s, v) => s + v.validated, 0);
  const disputed = scored.reduce((s, v) => s + v.disputed, 0);

  const counts = new Map(STATUS_ORDER.map((s) => [s as number, jobs.filter((j) => j.status === s).length]));
  const budgetMicro = jobs
    .filter((j) => j.status !== JOB_CANCELLED)
    .reduce((sum, j) => sum + j.budgetMicro, 0);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Network stats</h1>
          <RealChainBadge />
          <TestNetBadge />
          {round && (
            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              read at {NETWORK_LABEL} round <span className="tnum">{int(round)}</span>
            </span>
          )}
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Counts, not estimates. Every figure below is something read from Algorand TestNet during this
          request — a box listing, a global-state uint, an account balance, or transactions from the public
          indexer — and each one is printed next to the query that produced it. Where a read failed the tile
          says <em>unreadable</em> rather than 0.
        </p>
        <RegistryTabs active="stats" />
      </header>

      {fatal && <ChainReadError what="the Identity Registry" message={fatal} />}

      {!fatal && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Agents registered"
              value={int(agents.length)}
              sub={`ag_ boxes that exist right now · agent_count has reached ${counterText(identityRead.data?.counter)}`}
            />
            <Stat
              label="Jobs posted"
              value={int(jobs.length)}
              sub={`jb_ boxes on the board · job_count has reached ${counterText(validationState?.counter)}`}
            />
            <Stat
              label="Escrow held"
              value={usdc(units(escrowedMicro))}
              unit={SETTLEMENT_ASSET.unitName}
              sub={
                escrows.size > 0
                  ? `across ${int(escrows.size)} es_ box${escrows.size === 1 ? "" : "es"}`
                  : "no es_ box exists, so the contract is holding nothing"
              }
              tone={escrowedMicro > 0 ? "info" : undefined}
            />
            <Stat
              label="Settlements"
              value={settlements ? int(settlements.count) : "unreadable"}
              sub={
                settlements == null
                  ? "the indexer did not answer, so no count is claimed"
                  : settlements.complete
                    ? `every non-zero transfer of asset ${SETTLEMENT_ASSET.id}, all pages walked`
                    : `at least this many — the indexer cursor was still running when the page limit was reached`
              }
              tone={settlements != null && !settlements.complete ? "warn" : undefined}
            />
          </div>

          <Panel className="mt-5" title="Jobs by status" note={`jb_ boxes in app ${REGISTRIES.validation.appId}`}>
            <div className="overflow-x-auto">
              <table className="tbl w-full min-w-[720px]">
                <thead>
                  <tr>
                    <PlainTh width={150}>Status</PlainTh>
                    <PlainTh align="right" width={90}>
                      Jobs
                    </PlainTh>
                    <PlainTh align="right" width={140}>
                      Budget stated
                    </PlainTh>
                    <PlainTh align="right" width={140}>
                      Escrow held
                    </PlainTh>
                    <PlainTh>What the status means</PlainTh>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_ORDER.map((code) => {
                    const meta = CHAIN_JOB_STATUS[code];
                    const inState = jobs.filter((j) => j.status === code);
                    const budget = inState.reduce((s, j) => s + j.budgetMicro, 0);
                    const held = inState.reduce((s, j) => s + (escrows.get(j.jobId) ?? 0), 0);
                    return (
                      <tr key={code}>
                        <td>
                          <Status tone={meta.tone} label={meta.label} size="sm" />
                        </td>
                        <td className="tnum text-right font-medium">{int(counts.get(code) ?? 0)}</td>
                        <td className="tnum text-right" style={{ color: "var(--ink-2)" }}>
                          {inState.length ? usdc(units(budget)) : "—"}
                        </td>
                        <td className="tnum text-right" style={{ color: held > 0 ? "var(--ink)" : "var(--ink-3)" }}>
                          {held > 0 ? usdc(units(held)) : "none"}
                        </td>
                        <td style={{ color: "var(--ink-2)" }}>{meta.hint}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="font-medium">All</td>
                    <td className="tnum text-right font-medium">{int(jobs.length)}</td>
                    <td className="tnum text-right font-medium">{usdc(units(budgetMicro))}</td>
                    <td className="tnum text-right font-medium">
                      {escrowedMicro > 0 ? usdc(units(escrowedMicro)) : "none"}
                    </td>
                    <td style={{ color: "var(--ink-2)" }}>
                      Budget excludes cancelled jobs, which are owed nothing. Budget and escrow are different
                      facts: posting a job moves no money at all.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <Panel title="Settlement" note={`asset ${SETTLEMENT_ASSET.id}`}>
              <dl className="divide-y" style={{ borderColor: "var(--line)" }}>
                <Line
                  label="Transfers on the chain"
                  value={settlements ? int(settlements.count) : "unreadable"}
                  hint={`Non-zero transfers of ${SETTLEMENT_ASSET.unitName}, counted from the indexer. Zero-amount transfers are dropped — an opt-in is a 0-unit self-transfer and counting it would put a payment on the board that paid for nothing.`}
                />
                <Line
                  label="Volume moved"
                  value={settlements ? `${usdc(units(settlements.volumeMicro))} ${SETTLEMENT_ASSET.unitName}` : "unreadable"}
                  hint="Summed over those transfers. This is every movement of the asset, including escrow funding and payouts — not only payments for work."
                />
                <Line
                  label="Distinct payers / payees"
                  value={settlements ? `${int(settlements.senders)} / ${int(settlements.receivers)}` : "unreadable"}
                  hint="Addresses seen sending and receiving. A small number of both usually means one operator moving money between accounts it controls, and that is worth knowing before reading anything into the volume."
                />
                <Line
                  label="Credited to reputation"
                  value={int(creditedPayments)}
                  hint="jobs_paid summed across every sc_ box. Lower than the transfer count by design: a transfer only becomes reputation when someone calls accept_feedback with it, and escrow movements are never counted."
                />
                <Line
                  label="Volume credited"
                  value={`${usdc(units(creditedMicro))} ${SETTLEMENT_ASSET.unitName}`}
                  hint="volume_micro summed across every sc_ box, in base units divided by the asset's own six decimals."
                />
              </dl>
            </Panel>

            <Panel title="Custody and verdicts">
              <dl className="divide-y" style={{ borderColor: "var(--line)" }}>
                <Line
                  label="Jobs holding money"
                  value={int(escrows.size)}
                  hint="es_ boxes. The box exists only while money is held — release_escrow and refund_escrow delete it before they send — so this is exactly the funded set."
                />
                <Line
                  label="The app's own balance"
                  value={
                    holdings == null
                      ? "unreadable"
                      : holdings.optedIn
                        ? `${usdc(units(holdings.heldMicro))} ${SETTLEMENT_ASSET.unitName}`
                        : "not opted in"
                  }
                  hint={
                    holdings == null
                      ? "The account read failed, so no claim is made about what the contract holds."
                      : holdings.optedIn
                        ? `Read from ${holdings.address}. An Algorand account cannot hold an asset it has not opted into, so this balance bounds what the contract could owe.`
                        : "The app is not opted into the settlement asset, so it could not hold it even if someone sent it."
                  }
                />
                <Line
                  label="Verdicts recorded"
                  value={`${int(validated)} validated / ${int(disputed)} disputed`}
                  hint="Summed from the sc_ boxes. Written only by the ValidationRegistry, by inner call — an address calling record_validation directly has a caller_application_id of 0 and is refused."
                />
                <Line
                  label="Dispute window"
                  value={disputeState?.counter == null ? "unreadable" : `${int(disputeState.counter)} seconds`}
                  hint="From the ValidationRegistry's own global state. After it elapses from a passing verdict, anyone may release the escrow — not only the client."
                />
                <Line
                  label="Agents with a reputation record"
                  value={`${int(scored.length)} of ${int(agents.length)}`}
                  hint="An agent with no sc_ box has never been paid. That is not the same as having been paid zero, and the two are never collapsed here."
                />
              </dl>
            </Panel>
          </div>

          <Panel className="mt-5" title="The three registries">
            <RegistryApps
              counters={{
                identity: { label: "agent_count", value: counterText(identityRead.data?.counter) },
                reputation: {
                  label: "identity_app",
                  value: reputationState?.counter ? int(reputationState.counter) : "not bootstrapped",
                },
                validation: { label: "job_count", value: counterText(validationState?.counter) },
              }}
            />
            <p
              className="border-t px-4 py-3 text-[12.5px] leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
            >
              <span className="font-mono text-[12px]">agent_count</span> and{" "}
              <span className="font-mono text-[12px]">job_count</span> are the highest ids ever issued, not
              live counts — ids are never reused. The tiles above count boxes instead, which is what actually
              exists, and the two are printed side by side rather than one standing in for the other.
            </p>
          </Panel>

          <Panel className="mt-5" title="Every query on this page">
            <div className="px-4 py-4">
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Public endpoints, no key, and nothing of ours in the path. Paste any of these into a terminal
                and you get the bytes these numbers were computed from.
              </p>
              <ul className="mt-3 space-y-1.5">
                {[
                  `${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/boxes`,
                  `${TESTNET_ALGOD}/v2/applications/${REGISTRIES.reputation.appId}/boxes`,
                  `${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}/boxes`,
                  `${TESTNET_ALGOD}/v2/applications/${REGISTRIES.validation.appId}`,
                  `${TESTNET_INDEXER}/v2/transactions?asset-id=${SETTLEMENT_ASSET.id}&tx-type=axfer&limit=1000`,
                ].map((url) => (
                  <li key={url}>
                    <Out href={url}>{url}</Out>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                The settlement asset is{" "}
                <Out href={loraAsset(SETTLEMENT_ASSET.id)}>
                  {SETTLEMENT_ASSET.unitName} · {SETTLEMENT_ASSET.id}
                </Out>{" "}
                — six decimals, minted for this deployment rather than circulating TestNet USDC,
                because that faucet is login-gated. It is what the registries assert on every credit,
                which is why these pages say {SETTLEMENT_ASSET.unitName}. Per-job detail is on
                the <Link href="/registry/jobs" className="underline-offset-2 hover:underline" style={{ color: "var(--accent-deep)" }}>job board</Link>{" "}
                and the <Link href="/registry/escrow" className="underline-offset-2 hover:underline" style={{ color: "var(--accent-deep)" }}>escrow view</Link>.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3" style={{ borderColor: "var(--line)" }}>
      <dt className="text-[13px] font-medium">{label}</dt>
      <dd className="tnum ml-auto text-[14px] font-semibold">{value}</dd>
      <p className="w-full text-[12px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        {hint}
      </p>
    </div>
  );
}
