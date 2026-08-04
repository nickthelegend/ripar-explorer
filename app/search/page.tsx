import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BOX_PREFIX,
  REGISTRIES,
  TESTNET_ALGOD,
  getAgent,
  isAlgorandAddress,
  resolveByAddress,
  resolveByDomain,
  tryRead,
} from "@/lib/erc8004";
import { Panel } from "@/components/ui";
import { RegistrySearch } from "@/components/registry-search";
import { ChainReadError, Out, RealChainBadge, TestNetBadge } from "@/components/registry-ui";

export const metadata: Metadata = {
  title: "Resolve an agent",
  description:
    "Resolve an agent id, a domain or an Algorand address against Ripar's Identity Registry on Algorand TestNet, using the registry's own reverse indexes rather than a scan.",
  alternates: { canonical: "/search" },
};

export const dynamic = "force-dynamic";

/**
 * What the input was taken to be, and which box was therefore read.
 *
 * Reverse lookups are what the `dm_` and `ad_` boxes exist for: the contract
 * writes them on registration precisely so a resolver is ONE box read rather
 * than a walk over every `ag_` box. Scanning would also mean a resolver that
 * gets slower as the registry succeeds, and one that quietly stops finding
 * agents past whatever limit the scan used.
 */
type Lookup = {
  kind: "agent id" | "domain" | "Algorand address";
  /** The box name that was read, in the form the contract writes it. */
  boxName: string;
  input: string;
};

/**
 * A domain as the registry stores it. `dm_` is keyed by the exact UTF-8 bytes
 * of the string that was registered, so a paste with a scheme or a trailing
 * slash addresses a box that does not exist. Both spellings are tried and the
 * page says which one hit.
 */
function domainCandidates(raw: string): string[] {
  const out = [raw];
  const stripped = raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .trim();
  if (stripped && stripped !== raw) out.push(stripped);
  const lowered = stripped.toLowerCase();
  if (lowered && !out.includes(lowered)) out.push(lowered);
  return out;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = (typeof sp.q === "string" ? sp.q : "").trim();

  if (!raw) return <Shell query="" tried={[]} body={<Prompt />} />;

  const tried: Lookup[] = [];
  let resolved: number | null = null;
  let readError: string | null = null;

  if (/^\d+$/.test(raw)) {
    const agentId = Number.parseInt(raw, 10);
    tried.push({ kind: "agent id", boxName: `${BOX_PREFIX.agents}${agentId}`, input: raw });
    if (agentId >= 1) {
      const read = await tryRead(() => getAgent(agentId));
      readError = read.error;
      if (read.data) resolved = read.data.agentId;
    }
  } else if (isAlgorandAddress(raw)) {
    tried.push({ kind: "Algorand address", boxName: `${BOX_PREFIX.agentByAddress}<32-byte public key>`, input: raw });
    const read = await tryRead(() => resolveByAddress(raw));
    readError = read.error;
    // The contract's sentinel for "not registered" is 0, and its own comment
    // insists callers check it. A 0 rendered as an agent id would be a profile
    // for an agent that does not exist.
    if (read.data && read.data > 0) resolved = read.data;
  } else {
    for (const candidate of domainCandidates(raw)) {
      tried.push({ kind: "domain", boxName: `${BOX_PREFIX.agentByDomain}${candidate}`, input: candidate });
      const read = await tryRead(() => resolveByDomain(candidate));
      if (read.error) {
        readError = read.error;
        break;
      }
      if (read.data && read.data > 0) {
        resolved = read.data;
        break;
      }
    }
  }

  if (readError) {
    return <Shell query={raw} tried={tried} body={<ChainReadError what="the Identity Registry" message={readError} />} />;
  }

  // A hit is a redirect, not a result page. The answer to "who is
  // client.ripar.io" is that agent's profile, and stopping at an intermediate
  // page to say so would be a click for nothing.
  if (resolved) redirect(`/agent/${resolved}`);

  return <Shell query={raw} tried={tried} body={<NotFound query={raw} tried={tried} />} />;
}

/* ── layout ────────────────────────────────────────────────────────────── */

function Shell({ query, tried, body }: { query: string; tried: Lookup[]; body: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <header className="border-b pb-5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.55rem] font-semibold tracking-[-0.025em]">Resolve an agent</h1>
          <RealChainBadge />
          <TestNetBadge />
        </div>
        <p className="mt-2 max-w-[88ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          One input for three questions. An id reads the{" "}
          <span className="font-mono text-[12px]">{BOX_PREFIX.agents}</span> box directly; a domain reads{" "}
          <span className="font-mono text-[12px]">{BOX_PREFIX.agentByDomain}</span> and an address reads{" "}
          <span className="font-mono text-[12px]">{BOX_PREFIX.agentByAddress}</span> — the reverse indexes the
          contract writes on registration so a lookup is one box read rather than a scan over the whole
          registry.
        </p>
        <RegistrySearch defaultValue={query} />
      </header>
      {body}
      {tried.length > 0 && (
        <Panel className="mt-5" title="What was read">
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {tried.map((t, i) => (
              <li key={`${t.boxName}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="text-[12.5px] font-medium">Read as {t.kind}</span>
                <span className="font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                  {t.boxName}
                </span>
                <span className="ml-auto text-[12px]" style={{ color: "var(--ink-3)" }}>
                  app {REGISTRIES.identity.appId}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t px-4 py-2.5 text-[12px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
            Every one of those is a public request with no key in it. The box list the lookups run against:{" "}
            <Out href={`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/boxes`}>
              {`${TESTNET_ALGOD}/v2/applications/${REGISTRIES.identity.appId}/boxes`}
            </Out>
          </p>
        </Panel>
      )}
    </div>
  );
}

function Prompt() {
  return (
    <Panel className="mt-6" title="Three things resolve">
      <dl className="grid gap-x-8 gap-y-4 px-4 py-4 sm:grid-cols-3">
        {[
          { k: "An agent id", v: "1", why: `Read straight from the ${BOX_PREFIX.agents} box.` },
          {
            k: "A domain",
            v: "ripar-agent.vercel.app",
            why: `Resolved through ${BOX_PREFIX.agentByDomain}, the reverse index resolve_by_domain uses.`,
          },
          {
            k: "An Algorand address",
            v: "KBDRZK3B…KEISKQ",
            why: `Resolved through ${BOX_PREFIX.agentByAddress}, keyed by the 32-byte public key rather than the base32 text.`,
          },
        ].map((row) => (
          <div key={row.k}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em]" style={{ color: "var(--ink-3)" }}>
              {row.k}
            </dt>
            <dd className="mt-1 font-mono text-[12.5px]">{row.v}</dd>
            <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--ink-2)" }}>
              {row.why}
            </p>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function NotFound({ query, tried }: { query: string; tried: Lookup[] }) {
  const kind = tried[0]?.kind ?? "input";
  return (
    <div
      className="mt-6 rounded-xl border px-4 py-4"
      style={{ borderColor: "var(--line-strong)", background: "var(--panel)" }}
    >
      <p className="text-[14px] font-semibold">Not registered</p>
      <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The Identity Registry answered, and it has no record for{" "}
        <span className="font-mono text-[12.5px]" style={{ color: "var(--ink)" }}>
          {query}
        </span>{" "}
        as {kind === "agent id" ? "an" : "a"} {kind}.{" "}
        {kind === "domain"
          ? `A domain box is keyed by the exact bytes that were registered, so a near miss — a different subdomain, a trailing slash, a scheme — resolves to nothing rather than to something close.`
          : kind === "Algorand address"
            ? `The address is well-formed; it simply controls no agent record. Registering is what creates the ${BOX_PREFIX.agentByAddress} box.`
            : `Ids are issued in sequence by agent_count and never reused, so anything above the current count has not been registered yet.`}
      </p>
      <p className="mt-2.5 max-w-[80ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        This is a real answer from the chain rather than a failed read. The contract&rsquo;s own resolver
        returns 0 here and its comment insists callers check it — showing an empty profile instead would put a
        registration on screen that nobody ever made.
      </p>
      <Link
        href="/registry"
        className="mt-4 inline-block rounded-md border px-2.5 py-1 text-[12.5px] font-medium"
        style={{ borderColor: "var(--line-strong)" }}
      >
        Browse every registered agent
      </Link>
    </div>
  );
}
