import type { Metadata } from "next";
import Link from "next/link";
import {
  READ_LIMIT,
  REGISTRIES,
  TESTNET_ALGOD,
  getRegistryState,
  getScores,
  getTestnetRound,
  listAgents,
  listCountedPayments,
  listJobs,
  peraAddress,
  peraApp,
  peraTx,
  resolvePayments,
  tryRead,
  type CountedPayment,
  type OnchainAgent,
  type OnchainJob,
  type OnchainScore,
} from "@/lib/erc8004";
import { absTime, int, liveAgo, shortAddr, usdc } from "@/lib/format";
import { SETTLEMENT_ASSET, NETWORK_LABEL } from "@/lib/registries";
import { EmptyState, Panel, Stat, Status } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { RegistrySearch } from "@/components/registry-search";
import {
  ChainReadError,
  Out,
  PlainTh,
  RealChainBadge,
  RegistryApps,
  RegistryTabs,
  SortTh,
  TestNetBadge,
} from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Onchain agent registry",
  description:
    "Every agent registered in Ripar's ERC-8004 Identity Registry on Algorand TestNet, with the reputation the Reputation Registry has recorded for it — jobs paid, USDC settled, validated versus disputed. Read live from box storage.",
  alternates: { canonical: "/registry" },
};

// A registry is mutable. Prerendering this would freeze the agent list at
// deploy time and present it as current, which is the one thing a registry
// page must not do.
export const dynamic = "force-dynamic";

/* ── sorting, entirely in the query string ─────────────────────────────── */

const SORTS = ["id", "domain", "registered", "paid", "volume"] as const;
type Sort = (typeof SORTS)[number];

type Row = { agent: OnchainAgent; score: OnchainScore | null; jobs: OnchainJob[] };

/** An unreadable counter is reported as unreadable, never as zero. */
const counterText = (n: number | null | undefined) => (n == null ? "unreadable" : int(n));

function sortRows(rows: Row[], sort: Sort, dir: "asc" | "desc"): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  const key = (r: Row): number | string =>
    sort === "domain"
      ? r.agent.domain
      : sort === "registered"
        ? r.agent.registeredAt
        : sort === "paid"
          ? (r.score?.jobsPaid ?? 0)
          : sort === "volume"
            ? (r.score?.volumeMicro ?? 0)
            : r.agent.agentId;

  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (typeof x === "string" || typeof y === "string") return sign * String(x).localeCompare(String(y));
    // Ties fall back to the id, so the order is stable between reloads.
    return sign * (x - y) || a.agent.agentId - b.agent.agentId;
  });
}

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawSort = typeof sp.sort === "string" ? sp.sort : "";
  const sort: Sort = (SORTS as readonly string[]).includes(rawSort) ? (rawSort as Sort) : "id";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  /**
   * Each source is read independently so one outage does not blank the others.
   * The Identity Registry is the page: if the application itself or its box
   * list cannot be read, there is nothing honest left to render.
   */
  const [agentsRead, identityRead] = await Promise.all([
    tryRead(() => listAgents()),
    tryRead(() => getRegistryState("identity", "agent_count")),
  ]);

  // Order matters. A missing application answers its box list with an empty
  // 200, so `listAgents` succeeds and reports nothing — the application read is
  // the one that can tell "empty" apart from "not there", and it goes first.
  const fatal = identityRead.error
    ? `Application ${REGISTRIES.identity.appId} did not answer: ${identityRead.error}`
    : agentsRead.error;

  const agents = agentsRead.data ?? [];
  const identityState = identityRead.data;

  const [scores, jobs, payments, reputationState, validationState, round] = await Promise.all([
    getScores(agents.map((a) => a.agentId)).catch(() => new Map<number, OnchainScore>()),
    listJobs().catch(() => [] as OnchainJob[]),
    listCountedPayments().catch(() => [] as CountedPayment[]),
    getRegistryState("reputation", "identity_app").catch(() => null),
    getRegistryState("validation", "job_count").catch(() => null),
    getTestnetRound().catch(() => null),
  ]);

  // "Does this recorded payment id actually exist on TestNet?" is a different
  // question from "did the contract accept it", and the page answers both.
  const resolvesById = await resolvePayments(payments);
  const unresolved = [...resolvesById.values()].filter((ok) => ok === false).length;

  // Which agent each unbacked id was credited to. Without this the warning
  // lives only in the headline, and a row read on its own — or screenshotted —
  // still presents its jobs_paid as if every payment behind it happened.
  const unbackedByAgent = new Map<number, number>();
  for (const p of payments) {
    if (resolvesById.get(p.paymentTxId) === false) {
      unbackedByAgent.set(p.agentId, (unbackedByAgent.get(p.agentId) ?? 0) + 1);
    }
  }

  const rows: Row[] = agents.map((agent) => ({
    agent,
    score: scores.get(agent.agentId) ?? null,
    jobs: jobs.filter((j) => j.serverAgentId === agent.agentId),
  }));
  const sorted = sortRows(rows, sort, dir);

  const totals = {
    jobsPaid: rows.reduce((s, r) => s + (r.score?.jobsPaid ?? 0), 0),
    volumeUsdc: rows.reduce((s, r) => s + (r.score?.volumeUsdc ?? 0), 0),
    validated: rows.reduce((s, r) => s + (r.score?.validated ?? 0), 0),
    disputed: rows.reduce((s, r) => s + (r.score?.disputed ?? 0), 0),
  };

  const href = (nextSort: Sort) => {
    const flip = nextSort === sort && dir === "desc" ? "asc" : "desc";
    const qs = new URLSearchParams();
    if (nextSort !== "id") qs.set("sort", nextSort);
    if (flip !== "desc") qs.set("dir", flip);
    const q = qs.toString();
    return q ? `/registry?${q}` : "/registry";
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Onchain registry</h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          ERC-8004 gives agents three registries — identity, reputation and validation. These are ports of
          all three to Algorand, deployed and holding real records. Every agent below is a box in app{" "}
          <Out href={peraApp(REGISTRIES.identity.appId)}>{REGISTRIES.identity.appId}</Out>, decoded from its
          ARC-4 struct. Nothing here comes from the sample dataset the rest of the explorer runs on.
        </p>
        <RegistryTabs active="agents" />
        <RegistrySearch />
      </header>

      {fatal && <ChainReadError what="the Identity Registry" message={fatal} />}

      {!fatal && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Agents registered"
              value={int(agents.length)}
              sub="ag_ boxes in the Identity Registry, one per agent"
            />
            {/* The headline count would read as traction on its own. When a
                recorded id turns out to belong to no transaction, the figure
                says so here rather than only in the table below. */}
            <Stat
              label="Settled payments counted"
              value={int(totals.jobsPaid)}
              sub={
                unresolved > 0
                  ? `${int(unresolved)} of ${int(payments.length)} recorded ids ${
                      unresolved === 1 ? "does" : "do"
                    } not resolve to a TestNet transaction`
                  : "each one a transfer the AVM validated in the crediting call's own group"
              }
              tone={unresolved > 0 ? "warn" : undefined}
            />
            {/* volume_micro is accumulated by the same accept_feedback calls
                that wrote the pd_ boxes, so an id that matches no transaction
                puts an unbacked amount in this total too. Which amount is not
                recoverable — the contract keeps a sum, not a ledger — so the
                figure is qualified rather than adjusted. */}
            <Stat
              label={`${SETTLEMENT_ASSET.unitName} settled`}
              value={usdc(totals.volumeUsdc)}
              unit={SETTLEMENT_ASSET.unitName}
              sub={
                unresolved > 0
                  ? `summed from every agent's volume_micro — ${int(unresolved)} of the ${int(
                      payments.length,
                    )} payments behind this figure match no TestNet transaction`
                  : "summed from every agent's volume_micro"
              }
              tone={unresolved > 0 ? "warn" : undefined}
            />
            <Stat
              label="Validated / disputed"
              value={`${int(totals.validated)} / ${int(totals.disputed)}`}
              sub="verdicts the Validation Registry has recorded"
              tone={totals.disputed > 0 ? "warn" : undefined}
            />
          </div>

          <Panel
            className="mt-5"
            title="Agents in the Identity Registry"
            note={
              round
                ? `app ${REGISTRIES.identity.appId} · read at ${NETWORK_LABEL} round ${int(round)}`
                : `app ${REGISTRIES.identity.appId}`
            }
          >
            {agents.length === 0 ? (
              <EmptyState
                title="No agents are registered yet"
                body="The Identity Registry is deployed and readable, and it currently holds no ag_ boxes. An empty registry is a true answer — this page will show the first registration the moment it lands."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[1080px]">
                  <thead>
                    <tr>
                      <SortTh href={href("id")} active={sort === "id"} dir={dir} width={82}>
                        Agent id
                      </SortTh>
                      <SortTh href={href("domain")} active={sort === "domain"} dir={dir}>
                        Domain
                      </SortTh>
                      <PlainTh width={186}>Controlling address</PlainTh>
                      <SortTh href={href("registered")} active={sort === "registered"} dir={dir} width={132}>
                        Registered
                      </SortTh>
                      <SortTh href={href("paid")} active={sort === "paid"} dir={dir} align="right" width={104}>
                        Jobs paid
                      </SortTh>
                      <SortTh href={href("volume")} active={sort === "volume"} dir={dir} align="right" width={126}>
                        {SETTLEMENT_ASSET.unitName} settled
                      </SortTh>
                      <PlainTh width={152}>Validated / disputed</PlainTh>
                      <PlainTh align="right" width={104}>
                        On the board
                      </PlainTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(({ agent, score, jobs: agentJobs }) => {
                      const unbacked = unbackedByAgent.get(agent.agentId) ?? 0;
                      return (
                      <tr key={agent.agentId} id={`agent-${agent.agentId}`}>
                        {/* An agent id is Ripar's, not Algorand's, so no block
                            explorer has a page for it — this one does. The
                            profile is where the record, the score, the jobs and
                            the agent card's payout claim are read together. */}
                        <td className="tnum font-medium">
                          <Link
                            href={`/agent/${agent.agentId}`}
                            className="underline-offset-2 hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                            title={`Everything the registries record about agent ${agent.agentId}`}
                          >
                            #{agent.agentId}
                          </Link>
                        </td>
                        {/* Not a link. The registry records a domain; whether
                            anything is served there is not something this page
                            has checked, and a dead link would imply it had. */}
                        <td>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-mono text-[12.5px]" title={agent.domain}>
                              {agent.domain}
                            </span>
                            <CopyButton text={agent.domain} label="agent domain" />
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Out href={peraAddress(agent.address)} title={agent.address}>
                              {shortAddr(agent.address, 8, 6)}
                            </Out>
                            <CopyButton text={agent.address} label="agent address" />
                          </span>
                        </td>
                        <td>
                          <span className="text-[12.5px]" title={absTime(new Date(agent.registeredAt * 1000).toISOString())}>
                            {liveAgo(agent.registeredAt)}
                          </span>
                        </td>
                        {/* No record and a record of zero are different facts. */}
                        <td className="tnum text-right">
                          {score ? (
                            <>
                              {int(score.jobsPaid)}
                              {unbacked > 0 && (
                                <span
                                  className="block text-[11px] font-medium"
                                  style={{ color: "var(--warn)" }}
                                  title="The Reputation Registry counted these payment ids, but the TestNet indexer has no transaction with them. The contract checks that an id is unique, not that it belongs to a transfer that happened."
                                >
                                  {int(unbacked)} unbacked
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: "var(--ink-3)" }}>no record</span>
                          )}
                        </td>
                        <td className="tnum text-right">
                          {score ? usdc(score.volumeUsdc) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                        </td>
                        <td>
                          {score ? (
                            score.validated + score.disputed === 0 ? (
                              <Status tone="idle" label="Not yet judged" size="sm" />
                            ) : (
                              <span className="tnum text-[12.5px]">
                                <span style={{ color: "var(--ok)" }}>{int(score.validated)} validated</span>
                                <span style={{ color: "var(--ink-3)" }}> · </span>
                                <span style={{ color: score.disputed ? "var(--bad)" : "var(--ink-3)" }}>
                                  {int(score.disputed)} disputed
                                </span>
                              </span>
                            )
                          ) : (
                            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                              —
                            </span>
                          )}
                        </td>
                        <td className="text-right">
                          {agentJobs.length ? (
                            <Link
                              href={`/registry/jobs?agent=${agent.agentId}`}
                              className="text-[12.5px] font-medium underline-offset-2 hover:underline"
                              style={{ color: "var(--accent-deep)" }}
                            >
                              {int(agentJobs.length)} job{agentJobs.length === 1 ? "" : "s"}
                            </Link>
                          ) : (
                            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                              none
                            </span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {agents.length >= READ_LIMIT && (
              <p className="border-t px-4 py-2.5 text-[12px]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                Showing the first {READ_LIMIT} agents. Each box is its own request, so the page reads a bounded
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
              <Out href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/boxes`}>
                {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/boxes`}
              </Out>
            </p>
          </Panel>

          <Panel className="mt-5" title="What the reputation numbers mean">
            <div className="px-4 py-4 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              <p>
                <strong style={{ color: "var(--ink)" }}>Reputation here is derived from settled payments
                only.</strong>{" "}
                There is no star rating, no comment and no number a human typed. The Reputation Registry&rsquo;s{" "}
                <span className="font-mono text-[12px]">accept_feedback</span> takes the 32-byte id of the
                transfer that paid for the work, records it, and refuses to record it a second time — so{" "}
                <span className="font-mono text-[12px]">jobs_paid</span> counts distinct settlements and{" "}
                <span className="font-mono text-[12px]">volume_micro</span> is what they moved, in base units.
                The contract stores that count and never names an asset; Ripar settles in USDC, which has six
                decimals, and that is the conversion applied above. It is the whole of the mechanism, and it is
                why the number cannot be talked up.
              </p>
              <p className="mt-3">
                Validated and disputed come from somewhere else: the Validation Registry&rsquo;s verdict on a
                delivered result, written through{" "}
                <span className="font-mono text-[12px]">record_validation</span>. Disputes are kept and shown.
                Hiding them would make this a marketing figure rather than a record.
              </p>
              <p className="mt-3">
                The deployed <span className="font-mono text-[12px]">accept_feedback</span> takes the settling
                transfer as a <em>transaction in its own atomic group</em> and resolves both ends through the
                Identity Registry, so the amount is read off something consensus has already validated and the
                money must have gone from the client&rsquo;s registered address to the server&rsquo;s. An
                earlier deployment took the id and the amount as arguments and checked only that the id was 32
                bytes and unseen; two of the scores it published resolve to no transaction at all. That is the
                bug this shape closes.
              </p>
            </div>
          </Panel>

          <Panel
            className="mt-5"
            title="Payments already counted"
            note={`pd_ boxes in app ${REGISTRIES.reputation.appId}`}
          >
            {payments.length === 0 ? (
              <EmptyState
                title="There is no per-payment ledger to read"
                body={`The deployed Reputation Registry writes no pd_ boxes, so this table is empty by design rather than because nothing has settled — the scores above are the record. Keying a replay ledger on the transaction id was impossible anyway: the box name would depend on the txid, which depends on the group id, which depends on the app call, which must declare the box. Replay is already prevented by consensus, which rejects a duplicate txid outright.`}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[760px]">
                  <thead>
                    <tr>
                      <PlainTh>Payment transaction id</PlainTh>
                      <PlainTh width={132}>Credited to</PlainTh>
                      <PlainTh width={230}>Exists on TestNet</PlainTh>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const exists = resolvesById.get(p.paymentTxId);
                      return (
                        <tr key={p.paymentTxId}>
                          <td>
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Out href={peraTx(p.paymentTxId)} title={p.paymentTxId}>
                                {p.paymentTxId}
                              </Out>
                              <CopyButton text={p.paymentTxId} label="payment transaction id" />
                            </span>
                          </td>
                          <td>
                            <Link
                              href={`/registry#agent-${p.agentId}`}
                              className="tnum text-[12.5px] font-medium underline-offset-2 hover:underline"
                              style={{ color: "var(--accent-deep)" }}
                            >
                              agent #{p.agentId}
                            </Link>
                          </td>
                          <td>
                            {exists === true ? (
                              <Status tone="ok" label="Resolves on the indexer" size="sm" />
                            ) : exists === false ? (
                              <Status
                                tone="warn"
                                label="No such transaction"
                                size="sm"
                                title="The registry accepted this id, but no TestNet transaction has it. The contract checks uniqueness, not existence."
                              />
                            ) : (
                              <Status tone="idle" label="Could not check" size="sm" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {payments.length > 0 && (
              <p
                className="border-t px-4 py-3 text-[12.5px] leading-relaxed"
                style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}
              >
                The registry enforces uniqueness, not existence: it checks that an id is 32 bytes and has never
                been counted, never that it belongs to a transaction that happened. The right-hand column is
                that second check, run here against the TestNet indexer at read time.
              </p>
            )}
          </Panel>

          <Panel className="mt-5" title="The three registries">
            <RegistryApps
              counters={{
                identity: { label: "agent_count", value: counterText(identityState?.counter) },
                reputation: {
                  label: "identity_app",
                  // A pointer, not a tally. Zero means it was never set, which
                  // is a different statement from "zero of something".
                  value: reputationState?.counter ? int(reputationState.counter) : "not bootstrapped",
                },
                validation: { label: "job_count", value: counterText(validationState?.counter) },
              }}
            />
            <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-2)" }}>
              <span className="font-mono text-[12px]">agent_count</span> and{" "}
              <span className="font-mono text-[12px]">job_count</span> are the highest ids ever issued, not
              live counts — ids are never reused. The tables on these pages count boxes instead, which is what
              actually exists.{" "}
              <span className="font-mono text-[12px]">identity_app</span> is the Identity Registry that{" "}
              <span className="font-mono text-[12px]">bootstrap</span> pointed the Reputation Registry at; the
              deployed <span className="font-mono text-[12px]">accept_feedback</span> does not consult it
              either way.
              {identityState?.creator && (
                <>
                  {" "}
                  All three were deployed by{" "}
                  <Out href={peraAddress(identityState.creator)} title={identityState.creator}>
                    {shortAddr(identityState.creator, 8, 6)}
                  </Out>
                  .
                </>
              )}
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
