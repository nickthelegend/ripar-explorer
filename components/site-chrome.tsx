"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Mark } from "@/components/mark";
import {
  DATASET,
  DEFAULT_NETWORK,
  NETWORKS,
  USDC_ASSET_ID,
  explorerBase,
  isNetwork,
  resolveQuery,
  type Network,
} from "@/lib/explorer-data";
import { absTime } from "@/lib/format";
import { withNetwork } from "@/lib/nav";

const STORE_KEY = "ripar_explorer_network";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/transactions", label: "Transactions" },
];

function useNetwork(): Network {
  const params = useSearchParams();
  const raw = params.get("network");
  return isNetwork(raw) ? raw : DEFAULT_NETWORK;
}

/* ── header ────────────────────────────────────────────────────────────── */

export function SiteHeader() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const network = useNetwork();

  // Restore the last-used network only when the URL does not already name one.
  // Reading storage during render would make the server and client disagree,
  // so this runs after mount and simply rewrites the address.
  useEffect(() => {
    if (params.get("network")) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORE_KEY);
    } catch {
      // Storage is unavailable in private mode in some browsers; the URL
      // default is a perfectly good answer.
    }
    if (isNetwork(stored) && stored !== DEFAULT_NETWORK) {
      router.replace(`${pathname}?network=${stored}`, { scroll: false });
    }
  }, [params, pathname, router]);

  const switchTo = (next: Network) => {
    try {
      window.localStorage.setItem(STORE_KEY, next);
    } catch {
      /* see above */
    }
    const sp = new URLSearchParams(params.toString());
    if (next === DEFAULT_NETWORK) sp.delete("network");
    else sp.set("network", next);
    // The result set changes size, so any page cursor is meaningless now.
    sp.delete("page");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: "var(--line)", background: "rgba(255,255,255,0.88)" }}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        <Link href={withNetwork("/", network)} className="flex flex-none items-center gap-2">
          <Mark size={22} />
          <span className="text-[15px] font-semibold tracking-tight">Ripar</span>
          <span className="text-[15px]" style={{ color: "var(--ink-3)" }}>
            Explorer
          </span>
        </Link>

        <nav className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={withNetwork(item.href, network)}
                className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors"
                style={
                  active
                    ? { color: "var(--accent-deep)", background: "var(--wash)" }
                    : { color: "var(--ink-2)" }
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-2">
          <ResolverSearch network={network} />
          <div
            className="flex items-center rounded-lg border p-0.5"
            role="group"
            aria-label="Network"
            style={{ borderColor: "var(--line-strong)" }}
          >
            {NETWORKS.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => switchTo(n.id)}
                aria-pressed={n.id === network}
                className="rounded-md px-2 py-1 text-[12px] font-medium transition-colors"
                style={
                  n.id === network
                    ? { background: "var(--accent-deep)", color: "#fff" }
                    : { color: "var(--ink-2)" }
                }
              >
                {n.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * One search box that knows what you pasted. An agent id, handle, job id,
 * address or transaction id goes straight to the page that owns it; anything
 * else falls through to a text search. Sits in the layout so it is on every
 * route rather than three of five.
 */
function ResolverSearch({ network }: { network: Network }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const resolution = term.trim() ? resolveQuery(term, network) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!resolution) return;
        router.push(resolution.href);
        setTerm("");
      }}
      className="relative hidden md:block"
    >
      <Search
        size={13.5}
        strokeWidth={2}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--ink-3)" }}
      />
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Agent, job, address or tx id"
        aria-label="Search the explorer by identifier"
        spellCheck={false}
        className="h-8 w-[228px] rounded-lg border bg-transparent pl-8 pr-8 text-[12.5px] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--accent)]"
        style={{ borderColor: "var(--line-strong)" }}
      />
      {resolution && (
        <span
          className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide"
          style={{ color: resolution.kind === "search" ? "var(--ink-3)" : "var(--accent-deep)" }}
        >
          {resolution.kind === "search" ? "" : resolution.kind}
          <CornerDownLeft size={11} strokeWidth={2.4} />
        </span>
      )}
    </form>
  );
}

/* ── data source bar ───────────────────────────────────────────────────── */

/**
 * The trust strip. It names exactly where each record type comes from and
 * refuses to imply more than that: the registry and escrow apps are not
 * deployed yet, so they say so instead of showing a plausible-looking app id.
 * The one live identifier here — the USDC asset — links out so it can be
 * checked against a source that has nothing to do with us.
 */
export function DataSourceBar() {
  const network = useNetwork();
  const base = explorerBase(network);

  return (
    <div className="border-b" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 text-[11.5px] sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--accent-deep)" }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)" }} />
          Sample dataset
        </span>
        <span style={{ color: "var(--ink-2)" }}>
          {DATASET.agents} agents · {DATASET.jobs} jobs · {DATASET.transactions} transactions, captured{" "}
          <span className="tnum">{absTime(DATASET.snapshot)}</span>
        </span>

        <span className="hidden h-3 w-px lg:block" style={{ background: "var(--line-strong)" }} aria-hidden />

        <SourceRef label="Agent registry" value="not deployed" />
        <SourceRef label="Job escrow" value="not deployed" />
        <SourceRef label="Settlement asset" value={`USDC · ${USDC_ASSET_ID}`} href={`${base}/asset/${USDC_ASSET_ID}`} />
      </div>
    </div>
  );
}

function SourceRef({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-mono underline-offset-2 hover:underline"
          style={{ color: "var(--accent-deep)" }}
        >
          {value}
          <ArrowUpRight size={10.5} strokeWidth={2.4} />
        </a>
      ) : (
        <span className="font-mono" style={{ color: "var(--ink-2)" }}>
          {value}
        </span>
      )}
    </span>
  );
}

/* ── footer ────────────────────────────────────────────────────────────── */

export function SiteFooter() {
  const network = useNetwork();
  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-[12.5px] sm:px-6">
        <span className="inline-flex items-center gap-2">
          <Mark size={16} />
          <span className="font-medium">Ripar Explorer</span>
        </span>
        <p className="max-w-[52ch] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          A public index of agents, jobs and x402 settlements on Algorand. Every record shown today is
          sample data; the indexer replaces it without any change to these pages.
        </p>
        <nav className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2" style={{ color: "var(--ink-2)" }}>
          <Link href={withNetwork("/agents", network)} className="hover:text-[var(--accent-deep)]">
            Agents
          </Link>
          <Link href={withNetwork("/jobs", network)} className="hover:text-[var(--accent-deep)]">
            Jobs
          </Link>
          <Link href={withNetwork("/transactions", network)} className="hover:text-[var(--accent-deep)]">
            Transactions
          </Link>
          <a href="https://docs.ripar.io" className="hover:text-[var(--accent-deep)]">
            Docs
          </a>
          <a href="https://ripar.io" className="hover:text-[var(--accent-deep)]">
            ripar.io
          </a>
          <a href={explorerBase(network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-[var(--accent-deep)]">
            allo.info
            <ArrowUpRight size={11} strokeWidth={2.4} />
          </a>
        </nav>
      </div>
    </footer>
  );
}
