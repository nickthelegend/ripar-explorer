"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { TX_SORTS, fetchTransactions, networkLabel, txUrl, type Network, type Transaction, type TxKind } from "@/lib/explorer-data";
import { TX_KIND, TX_STATUS, algo, int, relTime, shortAddr, usdc } from "@/lib/format";
import { buildHref, readView, toQuery, withNetwork } from "@/lib/nav";
import { useResource } from "@/lib/use-resource";
import {
  ActiveFilters,
  FilterChips,
  Pagination,
  PlainTh,
  SearchInput,
  SortTh,
  type ChipDef,
} from "@/components/controls";
import { EmptyState, ErrorState, Panel, Status, TableSkeleton } from "@/components/ui";
import { CopyButton, Mono } from "@/components/copy-button";

const DEFAULTS = { sort: "time" };
const PATH = "/transactions";

const KIND_ORDER: TxKind[] = ["escrow-fund", "escrow-release", "escrow-refund"];

export function TransactionsView() {
  const params = useSearchParams();
  const view = readView(params, DEFAULTS.sort, TX_SORTS);
  const ctx = { pathname: PATH, view, defaults: DEFAULTS };

  const { data, error, loading } = useResource(() => fetchTransactions(toQuery(view)), JSON.stringify(view));

  // Counts are over the whole network slice, not a page of it — see `PageSize`.
  const counts = useResource(
    () => fetchTransactions({ network: view.network, pageSize: "all" }),
    `counts:${view.network}`,
  );

  const chips: ChipDef[] = [
    ...KIND_ORDER.map((k) => ({
      value: k,
      label: TX_KIND[k].label,
      tone: TX_KIND[k].tone,
      count: counts.data?.data.filter((t) => t.kind === k).length ?? 0,
    })),
    {
      value: "failed",
      label: "Rejected",
      tone: TX_STATUS.failed.tone,
      count: counts.data?.data.filter((t) => t.status === "failed").length ?? 0,
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-[1.6rem] font-semibold tracking-[-0.025em]">Transactions</h1>
        <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Every x402 settlement on {networkLabel(view.network)}: budgets committed to escrow, agents paid
          their agreed price, and unspent or refunded budget returned. Each row links out to allo.info so
          nothing here has to be taken on trust, and rejected transactions are shown alongside confirmed
          ones rather than swept out of sight.
        </p>
        <p className="mt-2 max-w-[74ch] text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Transaction ids in this sample capture are synthetic, so the allo.info links resolve to nothing
          until the indexer is connected. The wiring is real; the ids are not.
        </p>
      </header>

      <Panel>
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <SearchInput ctx={ctx} placeholder="Search tx id, address, job or agent" />
          <FilterChips ctx={ctx} options={chips} />
          <ActiveFilters ctx={ctx} noun="transactions" />
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
          <TableSkeleton rows={10} cols={6} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            title="No transactions match this query"
            body={
              view.q
                ? `Nothing on ${networkLabel(view.network)} matches “${view.q}”. Transaction ids are 52 characters of base32.`
                : `No settlement of that type has been recorded on ${networkLabel(view.network)}.`
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
                    <PlainTh width={210}>Transaction</PlainTh>
                    <SortTh ctx={ctx} column="kind" width={144}>
                      Type
                    </SortTh>
                    <PlainTh>Flow</PlainTh>
                    <SortTh ctx={ctx} column="amount" align="right" width={116}>
                      Amount
                    </SortTh>
                    <SortTh ctx={ctx} column="status" width={210}>
                      Result
                    </SortTh>
                    <SortTh ctx={ctx} column="round" align="right" width={112}>
                      Round
                    </SortTh>
                    <SortTh ctx={ctx} column="time" align="right" width={106}>
                      Time
                    </SortTh>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((t) => (
                    <TxRow key={t.id} tx={t} network={view.network} />
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
              noun="transactions"
            />
          </>
        ) : null}
      </Panel>
    </div>
  );
}

function TxRow({ tx, network }: { tx: Transaction; network: Network }) {
  const k = TX_KIND[tx.kind];
  const st = TX_STATUS[tx.status];
  return (
    <tr>
      <td>
        {/* The id opens OUR detail page, matching how agents and jobs behave.
            The block explorer is a separate, clearly-marked hop from there. */}
        <Link
          href={withNetwork(`/transactions/${tx.id}`, network)}
          title={tx.id}
          className="rowlink font-mono text-[12px] hover:underline"
          style={{ color: "var(--accent-deep)" }}
        >
          {tx.id.slice(0, 18)}…
        </Link>
        <span className="above-rowlink ml-1 inline-flex items-center align-middle">
          <a
            href={txUrl(tx.network, tx.id)}
            target="_blank"
            rel="noreferrer"
            title={`${tx.id} on the block explorer — sample ids do not resolve`}
            aria-label={`Open ${tx.id} on the block explorer`}
            style={{ color: "var(--ink-3)" }}
          >
            <ArrowUpRight size={10.5} strokeWidth={2.4} />
          </a>
          <CopyButton text={tx.id} label={`transaction id ${tx.id}`} />
        </span>
        <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          fee {algo(tx.feeMicroAlgo)} ALGO
        </span>
      </td>
      <td>
        <Status tone={k.tone} label={k.label} title={k.hint} size="sm" />
      </td>
      <td className="min-w-0">
        <span className="flex items-center gap-1" style={{ color: "var(--ink-2)" }}>
          <Mono value={tx.from} display={shortAddr(tx.from, 6, 4)} label="sender address" />
          <span aria-hidden style={{ color: "var(--ink-3)" }}>
            →
          </span>
          <Mono value={tx.to} display={shortAddr(tx.to, 6, 4)} label="recipient address" />
        </span>
        <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {tx.jobId ? (
            <Link href={withNetwork(`/jobs/${tx.jobId}`, network)} className="font-mono hover:underline">
              {tx.jobId}
            </Link>
          ) : (
            "—"
          )}
          {tx.agentId && (
            <>
              {" · "}
              <Link href={withNetwork(`/agents/${tx.agentId}`, network)} className="font-mono hover:underline">
                {tx.agentId}
              </Link>
            </>
          )}
          {tx.x402 && <span title={`x402 ${tx.x402.scheme} · ${tx.x402.resource}`}> · x402 {tx.x402.scheme}</span>}
        </span>
      </td>
      <td className="num tnum" style={{ color: tx.status === "failed" ? "var(--ink-3)" : undefined }}>
        {usdc(tx.amountUsdc)}
        {tx.protocolFeeUsdc > 0 && (
          <span
            className="mt-0.5 block text-[11px]"
            style={{ color: "var(--ink-3)" }}
            title="Protocol fee withheld inside this transaction"
          >
            −{usdc(tx.protocolFeeUsdc)} fee
          </span>
        )}
      </td>
      <td>
        <Status tone={st.tone} label={st.label} title={tx.failureReason ?? undefined} size="sm" />
        {tx.failureReason && (
          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {tx.failureReason.replace(/^logic eval error: assert failed — /, "")}
          </span>
        )}
      </td>
      <td className="num tnum" style={{ color: "var(--ink-2)" }}>
        {int(tx.round)}
      </td>
      <td className="num whitespace-nowrap" style={{ color: "var(--ink-2)" }}>
        {relTime(tx.timestamp)}
      </td>
    </tr>
  );
}
