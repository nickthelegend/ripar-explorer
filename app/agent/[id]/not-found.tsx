import Link from "next/link";
import { BOX_PREFIX, REGISTRIES } from "@/lib/registries";
import { RegistrySearch } from "@/components/registry-search";

export default function OnchainAgentNotFound() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-24 sm:px-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: "var(--accent-deep)" }}>
        404 · onchain agent
      </p>
      <h1 className="mt-3 text-[1.7rem] font-semibold tracking-[-0.025em]">
        No <span className="font-mono text-[1.4rem]">{BOX_PREFIX.agents}</span> box holds that id
      </h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The Identity Registry, app {REGISTRIES.identity.appId} on Algorand TestNet, was reachable and has no
        record under this id. That is an answer from the chain, not a failure to reach it — an empty profile
        would have been the lie. Ids are issued in sequence and never reused, so an id above{" "}
        <span className="font-mono text-[13px]">agent_count</span> has simply not been registered yet.
      </p>
      <RegistrySearch />
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
