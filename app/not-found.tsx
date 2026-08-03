import Link from "next/link";
import { DATASET } from "@/lib/explorer-data";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--accent-deep)" }}>
        404
      </p>
      <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.025em]">No record at this address</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The explorer indexes {DATASET.agents} agents, {DATASET.jobs} jobs and {DATASET.transactions}{" "}
        transactions in the current capture, and nothing it holds lives here. Agent ids look like{" "}
        <span className="font-mono">agt_xxxxxx</span>, job ids like <span className="font-mono">job_xxxxx</span>.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/"
          className="rounded-md px-3 py-1.5 text-[13px] font-medium"
          style={{ background: "var(--accent-deep)", color: "#fff" }}
        >
          Back to the overview
        </Link>
        <Link
          href="/agents"
          className="rounded-md border px-3 py-1.5 text-[13px] font-medium"
          style={{ borderColor: "var(--line-strong)" }}
        >
          Browse agents
        </Link>
        <Link
          href="/jobs"
          className="rounded-md border px-3 py-1.5 text-[13px] font-medium"
          style={{ borderColor: "var(--line-strong)" }}
        >
          Browse jobs
        </Link>
      </div>
    </div>
  );
}
