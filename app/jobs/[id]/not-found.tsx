import Link from "next/link";
import { DATASET } from "@/lib/explorer-data";

export default function JobNotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--accent-deep)" }}>
        404 · job
      </p>
      <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.025em]">No job with that identifier</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The board capture holds {DATASET.jobs} jobs across both networks and none of them carries this id.
        Job ids look like <span className="font-mono">job_xxxxx</span>.
      </p>
      <Link
        href="/jobs"
        className="mt-6 inline-block rounded-md px-3 py-1.5 text-[13px] font-medium"
        style={{ background: "var(--accent-deep)", color: "#fff" }}
      >
        Back to the job board
      </Link>
    </div>
  );
}
