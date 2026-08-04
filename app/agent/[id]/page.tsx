import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, HelpCircle } from "lucide-react";
import {
  BOX_PREFIX,
  READ_LIMIT,
  REGISTRIES,
  SETTLEMENT_ASSET,
  TESTNET_ALGOD,
  getAgent,
  getEscrows,
  getScore,
  getTestnetRound,
  listAgents,
  listJobs,
  listSettlements,
  loraAddress,
  loraAsset,
  loraTx,
  peraApp,
  tryRead,
  type OnchainAgent,
  type OnchainJob,
  type Settlement,
} from "@/lib/erc8004";
import { checkAgentCard, type CardCheck } from "@/lib/agent-card";
import { absTime, chainJobStatus, int, liveAgo, shortAddr, usdc } from "@/lib/format";
import { EmptyState, Field, Panel, Stat, Status } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { RegistrySearch } from "@/components/registry-search";
import {
  ChainReadError,
  Out,
  PlainTh,
  RealChainBadge,
  TestNetBadge,
} from "@/components/registry-ui";

// One agent's record, its score and its card, all read at request time. A
// prerender would freeze an address that the whole page exists to check.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const agentId = Number.parseInt(id, 10);
  const agent = Number.isInteger(agentId) ? await getAgent(agentId).catch(() => null) : null;
  return {
    title: agent ? `Agent #${agent.agentId} · ${agent.domain}` : `Agent #${id}`,
    description: agent
      ? `Everything Ripar's ERC-8004 registries on Algorand TestNet record about agent #${agent.agentId} (${agent.domain}): its controlling address, its settled-payment score, the jobs it is assigned, and whether the payout address on its A2A card matches the one registered onchain.`
      : "An agent record read live from Ripar's Identity Registry on Algorand TestNet.",
    alternates: { canonical: `/agent/${id}` },
  };
}

const microToUnits = (micro: number) => micro / 10 ** SETTLEMENT_ASSET.decimals;

/* ── the check the registry exists to make ─────────────────────────────── */

const VERDICT: Record<
  CardCheck["verdict"],
  { headline: string; tone: "ok" | "bad" | "warn" | "idle"; border: string; background: string }
> = {
  match: {
    headline: "The card asks you to pay the address the chain registered",
    tone: "ok",
    border: "rgba(21,128,61,0.28)",
    background: "rgba(21,128,61,0.05)",
  },
  mismatch: {
    headline: "The card asks you to pay a DIFFERENT address to the one registered onchain",
    tone: "bad",
    border: "rgba(192,38,38,0.45)",
    background: "rgba(192,38,38,0.08)",
  },
  "no-payto": {
    headline: "The card declares no payout address at all",
    tone: "warn",
    border: "rgba(180,83,9,0.28)",
    background: "rgba(180,83,9,0.05)",
  },
  unreachable: {
    headline: "The card could not be read, so nothing was checked",
    tone: "idle",
    border: "var(--line-strong)",
    background: "var(--panel-2)",
  },
  "not-json": {
    headline: "Something answered, but it was not an agent card",
    tone: "idle",
    border: "var(--line-strong)",
    background: "var(--panel-2)",
  },
};

function CardVerdict({ check, agent }: { check: CardCheck; agent: OnchainAgent }) {
  const v = VERDICT[check.verdict];
  const Icon =
    check.verdict === "match" ? Check : check.verdict === "mismatch" ? AlertTriangle : HelpCircle;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border" style={{ borderColor: v.border, background: v.background }}>
      <div className="flex items-start gap-3 px-4 py-4">
        <Icon
          size={17}
          strokeWidth={2.4}
          aria-hidden
          className="mt-[2px] flex-none"
          style={{
            color:
              check.verdict === "match"
                ? "var(--ok)"
                : check.verdict === "mismatch"
                  ? "var(--bad)"
                  : check.verdict === "no-payto"
                    ? "var(--warn)"
                    : "var(--ink-3)",
          }}
        />
        <div className="min-w-0">
          <h2
            className="text-[14.5px] font-semibold leading-snug"
            style={{
              color:
                check.verdict === "match"
                  ? "var(--ok)"
                  : check.verdict === "mismatch"
                    ? "var(--bad)"
                    : check.verdict === "no-payto"
                      ? "var(--warn)"
                      : "var(--ink)",
            }}
          >
            {v.headline}
          </h2>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            An agent card is self-published: every word in it, including the address it wants to be paid at, is
            a claim its own operator wrote. The address in the <span className="font-mono text-[12px]">ag_</span>{" "}
            box is not — <span className="font-mono text-[12px]">new_agent</span> takes the owner from{" "}
            <span className="font-mono text-[12px]">Txn.sender</span>, so it was proved by a signature. Comparing
            the two is the only reason a registry is worth reading before paying.
          </p>

          {check.error && (
            <p className="mt-2.5 font-mono text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {check.error}
            </p>
          )}

          {check.verdict === "unreachable" && (
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              This is not a verdict on the agent. The registration stands and the record below is real; the
              domain simply did not answer, so the one claim that could have been checked was not.
            </p>
          )}
        </div>
      </div>

      <div className="border-t px-4 py-3.5" style={{ borderColor: v.border }}>
        <dl className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
          <Field label="Registered onchain" mono hint={`Box ${BOX_PREFIX.agents}${agent.agentId} in app ${REGISTRIES.identity.appId}`}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Out href={loraAddress(agent.address)} title={agent.address}>
                {agent.address}
              </Out>
              <CopyButton text={agent.address} label="registered address" />
            </span>
          </Field>

          <Field
            label="Asked for by the card"
            mono
            hint={
              check.payTo.length > 1
                ? `${check.payTo.length} payTo values were found in the document`
                : `Read from ${check.url}`
            }
          >
            {check.payTo.length === 0 ? (
              <span style={{ color: "var(--ink-3)" }}>
                {check.verdict === "no-payto" ? "no payTo in the document" : "not read"}
              </span>
            ) : (
              <ul className="space-y-1.5">
                {check.payTo.map((p) => (
                  <li key={`${p.path}:${p.value}`} className="min-w-0">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        className="truncate"
                        style={{ color: p.matches ? "var(--ok)" : "var(--bad)" }}
                        title={p.value}
                      >
                        {p.value}
                      </span>
                      <CopyButton text={p.value} label="payTo address from the card" />
                    </span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: "var(--ink-3)" }}>
                      {p.path}
                      {!p.wellFormed && " · not a well-formed Algorand address"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </dl>

        {/* Two more claims the card makes that the chain can answer. Secondary
            to the address — a wrong agent id is confusing, a wrong payout
            address is theft — but both are free to check while we are here. */}
        {(check.claimedAgentId != null || check.claimedIdentityApp != null || check.claimedAssetId != null) && (
          <dl className="mt-4 grid gap-x-8 gap-y-3 border-t pt-3.5 sm:grid-cols-3" style={{ borderColor: v.border }}>
            {check.claimedAgentId != null && (
              <Field label="Agent id on the card">
                {check.claimedAgentId === agent.agentId ? (
                  <Status tone="ok" label={`#${check.claimedAgentId} — matches`} size="sm" />
                ) : (
                  <Status
                    tone="bad"
                    label={`#${check.claimedAgentId} — this page is #${agent.agentId}`}
                    size="sm"
                    title="The card points at a different registry record than the one it is served from."
                  />
                )}
              </Field>
            )}
            {check.claimedIdentityApp != null && (
              <Field label="Identity Registry on the card">
                {check.claimedIdentityApp === REGISTRIES.identity.appId ? (
                  <Status tone="ok" label={`${check.claimedIdentityApp} — matches`} size="sm" />
                ) : (
                  <Status
                    tone="warn"
                    label={`${check.claimedIdentityApp} — this page read ${REGISTRIES.identity.appId}`}
                    size="sm"
                    title="The card names a different IdentityRegistry app than the one this explorer reads. The registries have been redeployed; a card pointing at an older one is stale, not necessarily hostile."
                  />
                )}
              </Field>
            )}
            {check.claimedAssetId != null && (
              <Field label="Asset the card prices in">
                {check.claimedAssetId === SETTLEMENT_ASSET.id ? (
                  <Status tone="ok" label={`${check.claimedAssetId} — the settlement asset`} size="sm" />
                ) : (
                  <Status
                    tone="warn"
                    label={`${check.claimedAssetId} — scores count ${SETTLEMENT_ASSET.id}`}
                    size="sm"
                    title="The card quotes prices in one asset and the ReputationRegistry only credits transfers of another, so a payment made exactly as the card asks would not move this agent's score."
                  />
                )}
              </Field>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number.parseInt(id, 10);
  // `/agent/1abc` parses to 1 with parseInt, which would silently render the
  // wrong agent for a mistyped URL.
  if (!/^\d+$/.test(id) || !Number.isInteger(agentId) || agentId < 1) notFound();

  const agentRead = await tryRead(() => getAgent(agentId));
  if (agentRead.error) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
        <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Agent #{agentId}</h1>
        <ChainReadError what="the Identity Registry" message={agentRead.error} />
      </div>
    );
  }
  const agent = agentRead.data;
  if (!agent) notFound();

  // Independent reads. A domain that will not answer must not blank the score,
  // and an indexer outage must not blank the identity record.
  const [score, jobs, escrows, agents, settlements, round, card] = await Promise.all([
    getScore(agentId).catch(() => null),
    listJobs().catch(() => [] as OnchainJob[]),
    getEscrows().catch(() => new Map<number, number>()),
    listAgents().catch(() => [] as OnchainAgent[]),
    listSettlements(agent.address).catch(() => null),
    getTestnetRound().catch(() => null),
    checkAgentCard(agent.domain, agent.address),
  ]);

  const agentById = new Map(agents.map((a) => [a.agentId, a]));
  const asServer = jobs.filter((j) => j.serverAgentId === agentId);
  const asValidator = jobs.filter((j) => j.validatorAgentId === agentId);
  const asClient = jobs.filter((j) => j.client === agent.address);
  const involved = jobs.filter(
    (j) => j.serverAgentId === agentId || j.validatorAgentId === agentId || j.client === agent.address,
  );

  const validatedJobs = asServer.filter((j) => j.status === 3).length;
  const disputedJobs = asServer.filter((j) => j.status === 4).length;

  const received = settlements?.filter((s) => s.direction === "in") ?? [];
  const receivedMicro = received.reduce((sum, s) => sum + s.amountMicro, 0);

  const roleOf = (job: OnchainJob) =>
    [
      job.serverAgentId === agentId ? "assignee" : null,
      job.validatorAgentId === agentId ? "validator" : null,
      job.client === agent.address ? "client" : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <Link
          href="/registry"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
          style={{ color: "var(--ink-2)" }}
        >
          <ArrowLeft size={12} strokeWidth={2.4} aria-hidden />
          All agents
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">
            Agent #{agent.agentId}
            <span className="ml-2.5 font-mono text-[1.05rem] font-medium" style={{ color: "var(--ink-2)" }}>
              {agent.domain}
            </span>
          </h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Everything the three registries record about this agent, decoded from its boxes at request time:
          identity from app{" "}
          <Out href={peraApp(REGISTRIES.identity.appId)}>{REGISTRIES.identity.appId}</Out>, reputation from{" "}
          <Out href={peraApp(REGISTRIES.reputation.appId)}>{REGISTRIES.reputation.appId}</Out>, jobs from{" "}
          <Out href={peraApp(REGISTRIES.validation.appId)}>{REGISTRIES.validation.appId}</Out>.
        </p>
        <RegistrySearch />
      </header>

      <CardVerdict check={card} agent={agent} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Payments credited"
          value={score ? int(score.jobsPaid) : "no record"}
          sub={
            score
              ? "distinct settled transfers accept_feedback has counted"
              : `No ${BOX_PREFIX.scores} box exists for this agent — never paid, rather than paid nothing`
          }
        />
        <Stat
          label={`${SETTLEMENT_ASSET.unitName} credited`}
          value={score ? usdc(microToUnits(score.volumeMicro)) : "—"}
          unit={score ? SETTLEMENT_ASSET.unitName : undefined}
          sub="volume_micro, summed by the registry from the transfers it credited"
        />
        <Stat
          label="Validated / disputed"
          value={score ? `${int(score.validated)} / ${int(score.disputed)}` : "—"}
          sub="the score's own counters, written by record_validation"
          tone={score && score.disputed > 0 ? "warn" : undefined}
        />
        <Stat
          label="Jobs on the board"
          value={int(involved.length)}
          sub={
            involved.length
              ? `${int(asServer.length)} as assignee · ${int(asValidator.length)} as validator · ${int(asClient.length)} as client`
              : "no jb_ box names this agent"
          }
        />
      </div>

      {/* The two counters disagree whenever a verdict was written but never
          reported back. Saying so is cheaper than letting a reader assume the
          registry lost a job. */}
      {score && validatedJobs + disputedJobs > score.validated + score.disputed && (
        <p
          className="mt-3 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed"
          style={{ borderColor: "rgba(180,83,9,0.28)", background: "rgba(180,83,9,0.05)", color: "var(--ink-2)" }}
        >
          <strong style={{ color: "var(--warn)" }}>These two counts do not agree, and that is a real gap.</strong>{" "}
          The Validation Registry records {int(validatedJobs)} validated and {int(disputedJobs)} disputed job
          {validatedJobs + disputedJobs === 1 ? "" : "s"} for this agent, while its score carries{" "}
          {int(score.validated)} / {int(score.disputed)}. The counters are only moved by the Reputation
          Registry&rsquo;s <span className="font-mono text-[12px]">record_validation</span>, and the deployed{" "}
          <span className="font-mono text-[12px]">validation_response</span> does not call it — so a verdict is
          written on the job and never reaches the score. Both numbers are shown as they are rather than
          reconciled here.
        </p>
      )}

      <Panel
        className="mt-5"
        title="Identity record"
        note={
          round
            ? `box ${BOX_PREFIX.agents}${agent.agentId} · read at TestNet round ${int(round)}`
            : `box ${BOX_PREFIX.agents}${agent.agentId}`
        }
      >
        <dl className="grid gap-x-8 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Agent id" hint="Ripar's own id, issued by agent_count and never reused">
            <span className="tnum">#{agent.agentId}</span>
          </Field>
          <Field label="Domain" mono hint="Where the A2A card is expected to be served from">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="truncate" title={agent.domain}>
                {agent.domain}
              </span>
              <CopyButton text={agent.domain} label="agent domain" />
            </span>
          </Field>
          <Field label="Controlling address" mono hint="The only account that may update this record">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Out href={loraAddress(agent.address)} title={agent.address}>
                {shortAddr(agent.address, 10, 8)}
              </Out>
              <CopyButton text={agent.address} label="controlling address" />
            </span>
          </Field>
          <Field label="Registered" hint={absTime(new Date(agent.registeredAt * 1000).toISOString())}>
            {liveAgo(agent.registeredAt)}
          </Field>
          <Field
            label="Last updated"
            hint={
              agent.updatedAt === agent.registeredAt
                ? "Unchanged since registration"
                : absTime(new Date(agent.updatedAt * 1000).toISOString())
            }
          >
            {agent.updatedAt === agent.registeredAt ? "never" : liveAgo(agent.updatedAt)}
          </Field>
          <Field label="Agent card" mono hint="Fetched server-side on every render, never cached">
            <Out href={card.url} title={card.url} mono={false}>
              /.well-known/agent.json
            </Out>
          </Field>
        </dl>
        <p className="border-t px-4 py-2.5 text-[12px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
          Read the same bytes yourself, from a public node with no key and nothing of ours in the path:{" "}
          <Out
            href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/box?name=b64:${encodeURIComponent(
              Buffer.from(
                new Uint8Array([
                  ...new TextEncoder().encode(BOX_PREFIX.agents),
                  ...(() => {
                    const b = new Uint8Array(8);
                    new DataView(b.buffer).setBigUint64(0, BigInt(agent.agentId), false);
                    return b;
                  })(),
                ]),
              ).toString("base64"),
            )}`}
          >
            {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/box?name=b64:…`}
          </Out>
        </p>
      </Panel>

      <Panel
        className="mt-5"
        title="Reputation"
        note={`box ${BOX_PREFIX.scores}${agent.agentId} in app ${REGISTRIES.reputation.appId}`}
      >
        {!score ? (
          <EmptyState
            title="This agent has no score box"
            body={`The Reputation Registry holds no ${BOX_PREFIX.scores}${agent.agentId} box, so no settlement has ever been credited to this agent. That is different from a score of zero, and it is shown as different.`}
          />
        ) : (
          <>
            <dl className="grid gap-x-8 gap-y-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Payments credited" hint="jobs_paid — one per settled transfer, countable once">
                <span className="tnum">{int(score.jobsPaid)}</span>
              </Field>
              <Field label={`${SETTLEMENT_ASSET.unitName} credited`} hint="volume_micro, in base units of six decimals">
                <span className="tnum">
                  {usdc(microToUnits(score.volumeMicro))} {SETTLEMENT_ASSET.unitName}
                </span>
              </Field>
              <Field label="Validated / disputed" hint="written by record_validation, not by the job board">
                <span className="tnum">
                  <span style={{ color: "var(--ok)" }}>{int(score.validated)}</span>
                  <span style={{ color: "var(--ink-3)" }}> / </span>
                  <span style={{ color: score.disputed ? "var(--bad)" : "var(--ink-3)" }}>{int(score.disputed)}</span>
                </span>
              </Field>
              <Field label="First credited" hint={absTime(new Date(score.firstAt * 1000).toISOString())}>
                {liveAgo(score.firstAt)}
              </Field>
              <Field label="Last credited" hint={absTime(new Date(score.lastAt * 1000).toISOString())}>
                {liveAgo(score.lastAt)}
              </Field>
              <Field label="Settlement asset" mono hint={`${SETTLEMENT_ASSET.name}, fixed at bootstrap`}>
                <Out href={loraAsset(SETTLEMENT_ASSET.id)}>
                  {SETTLEMENT_ASSET.unitName} · {SETTLEMENT_ASSET.id}
                </Out>
              </Field>
            </dl>
            <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
              Nothing above is a rating. <span className="font-mono text-[12px]">accept_feedback</span> takes the
              settling transfer as a transaction in its own group and resolves both ends through the Identity
              Registry, so a credit requires the money to have moved from the client&rsquo;s registered address
              to this agent&rsquo;s. That is the whole mechanism, and it is why the number cannot be talked up —
              only paid up.
            </p>
          </>
        )}
      </Panel>

      <Panel
        className="mt-5"
        title="Jobs"
        note={`jb_ boxes in app ${REGISTRIES.validation.appId} naming agent #${agent.agentId}`}
      >
        {involved.length === 0 ? (
          <EmptyState
            title="No job names this agent"
            body="Nothing on the Validation Registry's board has this agent as assignee, validator or client. Ids are never reused, so an agent with no jobs has simply never been given work."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl w-full min-w-[880px]">
              <thead>
                <tr>
                  <PlainTh width={76}>Job id</PlainTh>
                  <PlainTh width={150}>This agent&rsquo;s role</PlainTh>
                  <PlainTh width={140}>Status</PlainTh>
                  <PlainTh align="right" width={124}>
                    Budget
                  </PlainTh>
                  <PlainTh align="right" width={124}>
                    Escrow held
                  </PlainTh>
                  <PlainTh width={150}>Counterparty</PlainTh>
                  <PlainTh align="right" width={110}>
                    Posted
                  </PlainTh>
                </tr>
              </thead>
              <tbody>
                {involved
                  .slice()
                  .sort((a, b) => b.jobId - a.jobId)
                  .map((job) => {
                    const meta = chainJobStatus(job.status);
                    const held = escrows.get(job.jobId) ?? 0;
                    const other =
                      job.serverAgentId === agentId ? job.validatorAgentId : job.serverAgentId;
                    const otherAgent = other ? agentById.get(other) : undefined;
                    return (
                      <tr key={job.jobId}>
                        <td className="tnum font-medium">
                          <Link
                            href="/registry/jobs"
                            className="underline-offset-2 hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            #{job.jobId}
                          </Link>
                        </td>
                        <td className="text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                          {roleOf(job) || "—"}
                        </td>
                        <td>
                          <Status tone={meta.tone} label={meta.label} title={meta.hint} size="sm" />
                        </td>
                        <td className="tnum text-right">
                          {usdc(microToUnits(job.budgetMicro))}{" "}
                          <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                            {SETTLEMENT_ASSET.unitName}
                          </span>
                        </td>
                        <td className="tnum text-right">
                          {held > 0 ? (
                            <>
                              {usdc(microToUnits(held))}{" "}
                              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                                {SETTLEMENT_ASSET.unitName}
                              </span>
                            </>
                          ) : (
                            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }} title="No es_ box for this job">
                              none
                            </span>
                          )}
                        </td>
                        <td className="text-[12.5px]">
                          {other ? (
                            <Link
                              href={`/agent/${other}`}
                              className="font-medium underline-offset-2 hover:underline"
                              style={{ color: "var(--accent-deep)" }}
                            >
                              agent #{other}
                              {otherAgent && (
                                <span className="block truncate font-mono text-[11px]" style={{ color: "var(--ink-3)" }}>
                                  {otherAgent.domain}
                                </span>
                              )}
                            </Link>
                          ) : (
                            <span style={{ color: "var(--ink-3)" }}>—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <span
                            className="text-[12.5px]"
                            title={absTime(new Date(job.createdAt * 1000).toISOString())}
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
      </Panel>

      <Panel
        className="mt-5"
        title="Settlements"
        note={`${SETTLEMENT_ASSET.unitName} transfers touching this agent's address, from the TestNet indexer`}
      >
        <SettlementTable
          settlements={settlements}
          address={agent.address}
          credited={score?.jobsPaid ?? 0}
          receivedMicro={receivedMicro}
        />
      </Panel>

      {involved.length >= READ_LIMIT && (
        <p className="mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
          The board read a bounded slice of {READ_LIMIT} jobs; this agent may appear on more.
        </p>
      )}
    </div>
  );
}

/* ── settlements ───────────────────────────────────────────────────────── */

function SettlementTable({
  settlements,
  address,
  credited,
  receivedMicro,
}: {
  settlements: Settlement[] | null;
  address: string;
  credited: number;
  receivedMicro: number;
}) {
  if (settlements === null) {
    return (
      <EmptyState
        title="The indexer could not be reached"
        body="Transfers are read from the public TestNet indexer at request time and nothing here is cached, so this shows nothing rather than a stale list. The identity and score above came from algod and are unaffected."
      />
    );
  }
  if (settlements.length === 0) {
    return (
      <EmptyState
        title={`No ${SETTLEMENT_ASSET.unitName} has moved to or from this address`}
        body={`The indexer has no transfer of asset ${SETTLEMENT_ASSET.id} involving ${shortAddr(address, 8, 6)}. Zero-unit transfers — opt-ins — are excluded, because a payment that moved nothing is not a settlement.`}
      />
    );
  }

  const received = settlements.filter((s) => s.direction === "in");

  return (
    <>
      <div className="overflow-x-auto">
        <table className="tbl w-full min-w-[820px]">
          <thead>
            <tr>
              <PlainTh>Transaction</PlainTh>
              <PlainTh width={92}>Direction</PlainTh>
              <PlainTh width={168}>Counterparty</PlainTh>
              <PlainTh align="right" width={130}>
                Amount
              </PlainTh>
              <PlainTh align="right" width={116}>
                Round
              </PlainTh>
              <PlainTh align="right" width={104}>
                When
              </PlainTh>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => {
              const counterparty = s.direction === "in" ? s.sender : s.receiver;
              return (
                <tr key={s.txId}>
                  <td>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Out href={loraTx(s.txId)} title={s.txId}>
                        {shortAddr(s.txId, 10, 6)}
                      </Out>
                      <CopyButton text={s.txId} label="transaction id" />
                    </span>
                  </td>
                  <td>
                    <Status
                      tone={s.direction === "in" ? "ok" : "info"}
                      label={s.direction === "in" ? "Received" : "Sent"}
                      size="sm"
                    />
                  </td>
                  <td>
                    <Out href={loraAddress(counterparty)} title={counterparty}>
                      {shortAddr(counterparty, 8, 6)}
                    </Out>
                  </td>
                  <td className="tnum text-right">
                    {usdc(s.amountUsdc)}{" "}
                    <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                      {SETTLEMENT_ASSET.unitName}
                    </span>
                  </td>
                  <td className="tnum text-right text-[12.5px]">{int(s.round)}</td>
                  <td className="text-right">
                    <span className="text-[12.5px]" title={absTime(new Date(s.timestamp * 1000).toISOString())}>
                      {liveAgo(s.timestamp)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* A transfer proves money moved. A score proves the registry was told
          about it. They are different facts and the difference is the number
          worth surfacing. */}
      <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
        The indexer shows <span className="tnum font-medium">{int(received.length)}</span> inbound transfer
        {received.length === 1 ? "" : "s"} worth{" "}
        <span className="tnum font-medium">
          {usdc(receivedMicro / 10 ** SETTLEMENT_ASSET.decimals)} {SETTLEMENT_ASSET.unitName}
        </span>
        ; the Reputation Registry has credited <span className="tnum font-medium">{int(credited)}</span>.{" "}
        {received.length === credited
          ? "The two agree."
          : `The gap is not an error: a transfer only becomes reputation when someone calls accept_feedback with it in the same atomic group, and no transfer carries a flag saying whether that happened. There is no per-payment ledger onchain to reconcile against — the pd_ box that once tried to be one was removed as circular — so both numbers are reported as they are.`}
      </p>
    </>
  );
}
