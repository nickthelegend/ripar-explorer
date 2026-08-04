"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Mark } from "@/components/mark";
import { OPEN_SEARCH_EVENT } from "@/components/command-palette";
import {
  DATASET,
  DEFAULT_NETWORK,
  NETWORKS,
  USDC_ASSET_ID,
  explorerBase,
  isNetwork,
  type Network,
} from "@/lib/explorer-data";
import { absTime } from "@/lib/format";
import { withNetwork } from "@/lib/nav";
// Constants only — the reader itself is server-side, and importing app ids from
// one place is what stops this bar naming an app the pages no longer read.
import { REGISTRIES, peraApp } from "@/lib/registries";

const STORE_KEY = "ripar_explorer_network";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/transactions", label: "Transactions" },
  // The two backed by real chain data rather than the sample set: /live reads
  // MainNet settlements, /registry reads the TestNet registries. They sit
  // together at the end of the nav so the split reads as a boundary.
  { href: "/live", label: "Live" },
  { href: "/registry", label: "Registry" },
];

/**
 * The routes whose every figure comes off a chain, and which chain each one
 * reads. Kept as one table because the nav dot, the provenance bar, the network
 * control and the footer all have to agree.
 *
 * The network is part of the route, not a preference. `/live` reads MainNet
 * settlements and `/registry` reads apps deployed to TestNet and only TestNet —
 * neither can be moved by a toggle, so on these routes the network is stated
 * rather than offered.
 */
const REAL_CHAIN_ROUTES = [
  { prefix: "/live", network: "MainNet", why: "x402 settlements are read from the Algorand MainNet indexer." },
  {
    prefix: "/registry",
    network: "TestNet",
    why: "The three ERC-8004 registries are deployed to Algorand TestNet and nowhere else.",
  },
  // `/agent/<id>` and `/search` read the same boxes as `/registry`. They are
  // listed here rather than nested under it because the provenance strip keys
  // off this table alone — a real-chain page missing from it would be labelled
  // "sample dataset" while showing live records, which is the exact confusion
  // the strip exists to prevent.
  {
    prefix: "/agent",
    network: "TestNet",
    why: "An agent profile is decoded from box storage in the TestNet Identity, Reputation and Validation registries.",
  },
  {
    prefix: "/search",
    network: "TestNet",
    why: "Lookups resolve through the Identity Registry's own dm_ and ad_ boxes on TestNet.",
  },
] as const;

const realChainRoute = (pathname: string) =>
  REAL_CHAIN_ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) ?? null;

const isRealChain = (pathname: string) => realChainRoute(pathname) != null;

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
  const onChain = realChainRoute(pathname);

  // Restore the last-used network only when the URL does not already name one.
  // Reading storage during render would make the server and client disagree,
  // so this runs after mount and simply rewrites the address.
  useEffect(() => {
    // A `?network=` on a real-chain route is a claim the page cannot honour,
    // so the stored preference is not written onto one.
    if (realChainRoute(pathname)) return;
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
            const real = isRealChain(item.href);
            return (
              <Link
                key={item.href}
                href={real ? item.href : withNetwork(item.href, network)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors"
                style={
                  active
                    ? { color: "var(--accent-deep)", background: "var(--wash)" }
                    : { color: "var(--ink-2)" }
                }
              >
                {/* Provenance, not status: these two routes read a chain. The
                    bar underneath says so in words; this is the shorthand. */}
                {real && (
                  <span aria-hidden style={{ width: 5, height: 5, borderRadius: 99, background: "var(--ok)" }} />
                )}
                {item.label}
                {real && <span className="sr-only"> — real chain data</span>}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-2">
          <SearchTrigger />
          {/* On a real-chain route the network is a fact about what was read,
              not a setting. Offering the toggle here would let a reader select
              MainNet on a page that is showing TestNet boxes and get no
              indication that the choice did nothing. */}
          {onChain ? (
            <span
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium"
              title={onChain.why}
              style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
            >
              <span aria-hidden style={{ width: 5, height: 5, borderRadius: 99, background: "var(--ok)" }} />
              <span className="sr-only">Reading </span>
              {onChain.network}
            </span>
          ) : (
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
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Opens the command palette. It is a button rather than an input because the
 * search itself is a dialog: one place that answers for agents, jobs and
 * transactions at once, reachable with ⌘K from anywhere including this button.
 *
 * The shortcut is spelled out on the control rather than left to be discovered.
 */
function SearchTrigger() {
  // `navigator` does not exist during the server render, and printing ⌘ to a
  // Windows reader is worse than printing nothing. `useSyncExternalStore` is
  // the one hook that models "a value the server cannot know": it renders the
  // server snapshot, then swaps in the client's on hydration without a mismatch.
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(window.navigator.platform || window.navigator.userAgent),
    () => false,
  );

  const fire = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

  return (
    <button
      type="button"
      onClick={fire}
      aria-label="Search agents, jobs and transactions"
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-8 items-center gap-2 rounded-lg border bg-transparent px-2.5 text-[12.5px] transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--line-strong)", color: "var(--ink-3)" }}
    >
      <Search size={13.5} strokeWidth={2} aria-hidden />
      <span className="hidden md:inline">Search agents, jobs, transactions</span>
      <kbd
        className="ml-1 hidden rounded border px-1 font-sans text-[10.5px] md:inline"
        style={{ borderColor: "var(--line-strong)" }}
      >
        {mac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

/* ── data source bar ───────────────────────────────────────────────────── */

/**
 * The trust strip, and the one place the split is stated outright.
 *
 * This explorer shows two different kinds of record and they must never be
 * mistaken for each other. `/live` and `/registry` are read off a chain at
 * request time; `/agents`, `/jobs` and `/transactions` are a sample dataset.
 * The bar changes with the route rather than describing both at once, because
 * a reader on a page wants to know what *this* page is.
 *
 * Every identifier it names links out to somewhere that is not us.
 */
export function DataSourceBar() {
  const pathname = usePathname();
  const network = useNetwork();
  const base = explorerBase(network);
  const onChain = realChainRoute(pathname);
  const real = onChain != null;
  // Which chain, not which path. `/agent` and `/search` read the same TestNet
  // boxes as `/registry`; branching on the prefix would have labelled them with
  // `/live`'s MainNet copy the moment they were added.
  const readsRegistries = onChain?.network === "TestNet";

  return (
    <div className="border-b" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 text-[11.5px] sm:px-6">
        {real ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--ok)" }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "var(--ok)" }} />
              Real chain data
            </span>
            {readsRegistries ? (
              <>
                <span style={{ color: "var(--ink-2)" }}>
                  Read from box storage on Algorand TestNet at request time. Nothing cached, nothing seeded.
                </span>
                <span className="hidden h-3 w-px lg:block" style={{ background: "var(--line-strong)" }} aria-hidden />
                <SourceRef
                  label="Identity"
                  value={String(REGISTRIES.identity.appId)}
                  href={peraApp(REGISTRIES.identity.appId)}
                />
                <SourceRef
                  label="Reputation"
                  value={String(REGISTRIES.reputation.appId)}
                  href={peraApp(REGISTRIES.reputation.appId)}
                />
                <SourceRef
                  label="Validation"
                  value={String(REGISTRIES.validation.appId)}
                  href={peraApp(REGISTRIES.validation.appId)}
                />
              </>
            ) : (
              <span style={{ color: "var(--ink-2)" }}>
                x402 settlements read from the Algorand MainNet indexer at request time. Every row links to a
                block explorer.
              </span>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--accent-deep)" }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)" }} />
              Sample dataset
            </span>
            <span style={{ color: "var(--ink-2)" }}>
              {DATASET.agents} agents · {DATASET.jobs} jobs · {DATASET.transactions} transactions, captured{" "}
              <span className="tnum">{absTime(DATASET.snapshot)}</span>
            </span>

            <span className="hidden h-3 w-px lg:block" style={{ background: "var(--line-strong)" }} aria-hidden />

            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--ink-2)" }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: "var(--ok)" }} />
              Real chain data lives on{" "}
              <Link href="/registry" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--ok)" }}>
                /registry
              </Link>{" "}
              and{" "}
              <Link href="/live" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--ok)" }}>
                /live
              </Link>
            </span>

            <SourceRef label="Settlement asset" value={`USDC · ${USDC_ASSET_ID}`} href={`${base}/asset/${USDC_ASSET_ID}`} />
          </>
        )}
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
          A public index of agents, jobs and x402 settlements on Algorand. The registry and live pages read a
          chain directly; the agent, job and transaction pages are a sample dataset until the indexer lands.
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
          <Link href="/registry" className="hover:text-[var(--accent-deep)]">
            Registry
          </Link>
          <Link href="/registry/jobs" className="hover:text-[var(--accent-deep)]">
            Job board
          </Link>
          <a href="/feed.json" className="hover:text-[var(--accent-deep)]">
            JSON feed
          </a>
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
