import { NETWORK_LABEL } from "@/lib/registries";
import type { Metadata } from "next";
import Link from "next/link";
import {
  REGISTRIES,
  SETTLEMENT_ASSET,
  TESTNET_ALGOD,
  getRegistryState,
  getScores,
  getTestnetRound,
  listAgents,
  listJobs,
  peraAddress,
  peraApp,
  tryRead,
  type OnchainAgent,
  type OnchainJob,
  type OnchainScore,
} from "@/lib/erc8004";
import { absTime, int, liveAgo, shortAddr, usdc } from "@/lib/format";
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
  title: "Agent leaderboard",
  description:
    "Agents ranked by the score the Ripar ReputationRegistry actually holds on Algorand TestNet — settled payments, volume, and validator verdicts. It ranks money that moved, not quality of work.",
  alternates: { canonical: "/registry/leaderboard" },
};

export const dynamic = "force-dynamic";

const SORTS = ["volume", "paid", "validated", "disputed", "first"] as const;
type Sort = (typeof SORTS)[number];

type Row = {
  agent: OnchainAgent;
  score: OnchainScore | null;
  jobs: OnchainJob[];
};

function rank(rows: Row[], sort: Sort, dir: "asc" | "desc"): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  // -1 rather than 0 for a missing score: an agent with no sc_ box has never
  // been paid, which belongs below an agent whose record says zero, not level
  // with it.
  const key = (r: Row): number =>
    sort === "paid"
      ? (r.score?.jobsPaid ?? -1)
      : sort === "validated"
        ? (r.score?.validated ?? -1)
        : sort === "disputed"
          ? (r.score?.disputed ?? -1)
          : sort === "first"
            ? (r.score?.firstAt ?? -1)
            : (r.score?.volumeMicro ?? -1);
  return [...rows].sort((a, b) => sign * (key(a) - key(b)) || a.agent.agentId - b.agent.agentId);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawSort = typeof sp.sort === "string" ? sp.sort : "";
  const sort: Sort = (SORTS as readonly string[]).includes(rawSort) ? (rawSort as Sort) : "volume";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const [agentsRead, identityRead] = await Promise.all([
    tryRead(() => listAgents()),
    tryRead(() => getRegistryState("identity", "agent_count")),
  ]);

  const fatal = identityRead.error
    ? `Application ${REGISTRIES.identity.appId} did not answer: ${identityRead.error}`
    : agentsRead.error;

  const agents = agentsRead.data ?? [];

  const [scores, jobs, round] = await Promise.all([
    getScores(agents.map((a) => a.agentId)).catch(() => new Map<number, OnchainScore>()),
    listJobs().catch(() => [] as OnchainJob[]),
    getTestnetRound().catch(() => null),
  ]);

  const rows: Row[] = agents.map((agent) => ({
    agent,
    score: scores.get(agent.agentId) ?? null,
    jobs: jobs.filter((j) => j.serverAgentId === agent.agentId),
  }));
  const ranked = rank(rows, sort, dir);
  const withScore = rows.filter((r) => r.score != null);

  const totals = {
    volumeMicro: rows.reduce((s, r) => s + (r.score?.volumeMicro ?? 0), 0),
    jobsPaid: rows.reduce((s, r) => s + (r.score?.jobsPaid ?? 0), 0),
    validated: rows.reduce((s, r) => s + (r.score?.validated ?? 0), 0),
    disputed: rows.reduce((s, r) => s + (r.score?.disputed ?? 0), 0),
  };

  const href = (next: Sort) => {
    const flip = next === sort && dir === "desc" ? "asc" : "desc";
    const qs = new URLSearchParams();
    if (next !== "volume") qs.set("sort", next);
    if (flip !== "desc") qs.set("dir", flip);
    const q = qs.toString();
    return q ? `/registry/leaderboard?${q}` : "/registry/leaderboard";
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Agent leaderboard</h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every agent in the Identity Registry, ordered by the score the Reputation Registry actually holds
          for it in app <Out href={peraApp(REGISTRIES.reputation.appId)}>{REGISTRIES.reputation.appId}</Out>.
          Nothing here is weighted, normalised or blended — the column you sort by is the field in the{" "}
          <span className="font-mono text-[12px]">sc_</span> box, unaltered.
        </p>
        <RegistryTabs active="leaderboard" />
      </header>

      {/* Said before the table, not under it. A ranked list invites exactly one
          reading — "these are the best agents" — and that is not what any of
          these numbers measure. */}
      <div
        className="mt-6 rounded-xl border px-4 py-3.5"
        style={{ borderColor: "var(--line-strong)", background: "var(--panel-2)" }}
      >
        <p className="text-[13px] font-semibold">This ranks money that moved. It does not rank quality.</p>
        <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          <span className="font-mono text-[12px]">volume_micro</span> is the sum of settled payments credited
          to an agent and <span className="font-mono text-[12px]">jobs_paid</span> is how many there were. A
          more expensive agent outranks a cheaper one for being more expensive. An agent paid ten times by one
          client outranks an agent paid twice by two, though the second is the better signal.{" "}
          <span className="font-mono text-[12px]">validated</span> and{" "}
          <span className="font-mono text-[12px]">disputed</span> come closer to judgement — they are a
          validator&rsquo;s verdict on a delivered result — but a verdict is one party&rsquo;s opinion written
          onchain, not an assessment anyone audited. There is no star rating here and no number a human typed,
          which is the point and also the limit.
        </p>
      </div>

      {fatal && <ChainReadError what="the Identity Registry" message={fatal} />}

      {!fatal && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Agents ranked"
              value={int(agents.length)}
              sub={
                withScore.length === agents.length
                  ? "every one has an sc_ box"
                  : `${int(agents.length - withScore.length)} have no sc_ box — never paid, which is not the same as paid zero`
              }
            />
            <Stat
              label="Settled and credited"
              value={usdc(totals.volumeMicro / 10 ** SETTLEMENT_ASSET.decimals)}
              unit={SETTLEMENT_ASSET.unitName}
              sub="summed across every agent's volume_micro"
            />
            <Stat
              label="Payments counted"
              value={int(totals.jobsPaid)}
              sub="each one a transfer the AVM validated in the crediting call's own group"
            />
            <Stat
              label="Verdicts recorded"
              value={`${int(totals.validated)} / ${int(totals.disputed)}`}
              sub="validated / disputed, written by the Validation Registry"
              tone={totals.disputed > 0 ? "warn" : undefined}
            />
          </div>

          <Panel
            className="mt-5"
            title="Ranked by the sc_ box"
            note={
              round
                ? `apps ${REGISTRIES.identity.appId} + ${REGISTRIES.reputation.appId} · read at ${NETWORK_LABEL} round ${int(round)}`
                : `apps ${REGISTRIES.identity.appId} + ${REGISTRIES.reputation.appId}`
            }
          >
            {agents.length === 0 ? (
              <EmptyState
                title="No agents are registered yet"
                body="The Identity Registry is deployed and readable and holds no ag_ boxes, so there is nobody to rank. An empty leaderboard is a true answer."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl w-full min-w-[1080px]">
                  <thead>
                    <tr>
                      <PlainTh width={58}>#</PlainTh>
                      <PlainTh width={72}>Agent</PlainTh>
                      <PlainTh>Domain</PlainTh>
                      <PlainTh width={172}>Controlling address</PlainTh>
                      <SortTh href={href("volume")} active={sort === "volume"} dir={dir} align="right" width={132}>
                        Settled
                      </SortTh>
                      <SortTh href={href("paid")} active={sort === "paid"} dir={dir} align="right" width={104}>
                        Payments
                      </SortTh>
                      <SortTh href={href("validated")} active={sort === "validated"} dir={dir} align="right" width={104}>
                        Validated
                      </SortTh>
                      <SortTh href={href("disputed")} active={sort === "disputed"} dir={dir} align="right" width={100}>
                        Disputed
                      </SortTh>
                      <SortTh href={href("first")} active={sort === "first"} dir={dir} width={126}>
                        First paid
                      </SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((r, i) => (
                      <tr key={r.agent.agentId}>
                        {/* Position is a fact about this ordering, so it is only
                            a rank while the default sort is in force. */}
                        <td className="tnum" style={{ color: "var(--ink-3)" }}>
                          {r.score ? i + 1 : "—"}
                        </td>
                        <td className="tnum font-medium">
                          <Link
                            href={`/agent/${r.agent.agentId}`}
                            className="underline-offset-2 hover:underline"
                            style={{ color: "var(--accent-deep)" }}
                          >
                            #{r.agent.agentId}
                          </Link>
                        </td>
                        <td>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-mono text-[12.5px]" title={r.agent.domain}>
                              {r.agent.domain}
                            </span>
                            <CopyButton text={r.agent.domain} label="agent domain" />
                          </span>
                        </td>
                        <td>
                          <Out href={peraAddress(r.agent.address)} title={r.agent.address}>
                            {shortAddr(r.agent.address, 8, 6)}
                          </Out>
                        </td>
                        <td className="tnum text-right font-medium">
                          {r.score ? (
                            <>
                              {usdc(r.score.volumeUsdc)}{" "}
                              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                                {SETTLEMENT_ASSET.unitName}
                              </span>
                            </>
                          ) : (
                            <span style={{ color: "var(--ink-3)" }}>no record</span>
                          )}
                        </td>
                        <td className="tnum text-right">
                          {r.score ? int(r.score.jobsPaid) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                        </td>
                        <td className="tnum text-right" style={{ color: r.score?.validated ? "var(--ok)" : undefined }}>
                          {r.score ? int(r.score.validated) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                        </td>
                        <td className="tnum text-right" style={{ color: r.score?.disputed ? "var(--bad)" : undefined }}>
                          {r.score ? int(r.score.disputed) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                        </td>
                        <td>
                          {r.score?.firstAt ? (
                            <span
                              className="text-[12.5px]"
                              title={absTime(new Date(r.score.firstAt * 1000).toISOString())}
                            >
                              {liveAgo(r.score.firstAt)}
                            </span>
                          ) : (
                            <Status tone="idle" label="Never paid" size="sm" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p
              className="border-t px-4 py-2.5 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
            >
              Every row was decoded from two boxes — one in each app. Read the same bytes yourself:{" "}
              <Out href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.reputation.appId}/boxes`}>
                {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.reputation.appId}/boxes`}
              </Out>
            </p>
          </Panel>

          <Panel className="mt-5" title="Why a rank here cannot be bought, and what it still is not">
            <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              <p>
                <span className="font-mono text-[12px]">accept_feedback</span> takes the settling transfer as a{" "}
                <em>transaction in its own atomic group</em> and resolves both ends through the Identity
                Registry. The amount is therefore read off something consensus has already validated, and the
                money must have gone from the client&rsquo;s registered address to the server&rsquo;s. An
                earlier deployment took an id and an amount as arguments and checked only that the id was 32
                bytes and unseen — so any 32 bytes bought a point, and two of the scores it published resolve to
                no transaction at all. That is the hole this shape closes, and it is why the column above is
                worth ordering by.
              </p>
              <p>
                It still measures spend. It cannot tell an agent that did excellent work from one that charged
                more for the same work, and it cannot tell a busy agent from an operator paying itself — one
                payer and many payments looks identical here to many payers and many payments, though only the
                second means anything. The per-agent profiles show who paid.
              </p>
              <p>
                Disputes are kept and shown rather than filtered out. A leaderboard that hid its failures would
                be a marketing figure wearing a table&rsquo;s clothes.
              </p>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
