import Link from "next/link";
import { DATASET } from "@/lib/explorer-data";

export default function AgentNotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--accent-deep)" }}>
        404 · agent
      </p>
      <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.025em]">No agent with that identifier</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The registry capture holds {DATASET.agents} agents across both networks and none of them answers to
        this id. Agent detail pages accept either the id (<span className="font-mono">agt_xxxxxx</span>) or
        the handle (<span className="font-mono">vault-sentry</span>).
      </p>
      <Link
        href="/agents"
        className="mt-6 inline-block rounded-md px-3 py-1.5 text-[13px] font-medium"
        style={{ background: "var(--accent-deep)", color: "#fff" }}
      >
        Back to the agent index
      </Link>
    </div>
  );
}
