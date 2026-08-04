import Link from "next/link";
import { TESTNET_INDEXER } from "@/lib/registries";

export default function TransactionNotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--accent-deep)" }}>
        404 · transaction
      </p>
      <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.025em]">
        The TestNet indexer has no transaction with that id
      </h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The indexer answered, and answered 404. That is a fact about the chain rather than a failure to reach
        it — nothing was cached, retried or filled in. Two ordinary reasons for it: the transaction is on
        MainNet rather than TestNet, or it was composed but never submitted, in which case the id exists on
        whoever&rsquo;s screen composed it and nowhere else.
      </p>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The same lookup, with nothing of ours in the path:{" "}
        <span className="font-mono text-[12.5px]">{TESTNET_INDEXER}/v2/transactions/&lt;id&gt;</span>
      </p>
      <Link
        href="/registry"
        className="mt-6 inline-block rounded-md px-3 py-1.5 text-[13px] font-medium"
        style={{ background: "var(--accent-deep)", color: "#fff" }}
      >
        Back to the onchain registry
      </Link>
    </div>
  );
}
