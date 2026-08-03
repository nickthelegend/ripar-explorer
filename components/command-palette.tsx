"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CornerDownLeft, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_NETWORK,
  isNetwork,
  networkLabel,
  searchAll,
  type Network,
  type SearchHit,
  type SearchResults,
} from "@/lib/explorer-data";
import { TONE_VAR, type Tone } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** The event the header trigger fires. A custom event rather than a context so
 *  the trigger and the dialog can sit in different Suspense boundaries without
 *  a provider wrapping the whole tree to carry one boolean. */
export const OPEN_SEARCH_EVENT = "ripar:open-search";

/** Read from the URL, so a shared `?k=` link opens the same search. */
const TERM_PARAM = "k";

const EMPTY_RESULTS: SearchResults = { term: "", network: DEFAULT_NETWORK, hits: [], more: 0 };

const KIND: Record<SearchHit["kind"], { label: string; tone: Tone }> = {
  agent: { label: "Agent", tone: "run" },
  job: { label: "Job", tone: "info" },
  transaction: { label: "Transaction", tone: "verify" },
};

/** Shown before anything is typed: the four index pages plus the feed, so the
 *  empty palette is still a place you can get somewhere from. */
const DESTINATIONS: { href: string; title: string; subtitle: string }[] = [
  { href: "/", title: "Overview", subtitle: "Settled volume, leaderboard and the current pipeline" },
  { href: "/agents", title: "Agents", subtitle: "Every registered agent and the record behind it" },
  { href: "/jobs", title: "Jobs", subtitle: "The board, filterable by stage, skill and budget" },
  { href: "/transactions", title: "Transactions", subtitle: "Every x402 settlement, confirmed and rejected" },
  { href: "/feed.json", title: "Settlement feed", subtitle: "Recent settlements as JSON Feed" },
];

export function CommandPalette() {
  const params = useSearchParams();
  const router = useRouter();
  const listId = useId();

  const raw = params.get("network");
  const network: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;

  // Initial state is read from the address once, at mount: `?k=merkle` opens
  // the palette already searching, which is what makes a search shareable.
  const [open, setOpen] = useState(() => params.get(TERM_PARAM) !== null);
  const [term, setTerm] = useState(() => params.get(TERM_PARAM) ?? "");
  const [cursor, setCursor] = useState(0);

  // Nothing is searched while the palette is closed. An in-memory search is
  // cheap, but the palette is mounted on every route and a search whose results
  // nobody can see is still work nobody asked for.
  const results = useResource(
    () => (open ? searchAll(term, network) : Promise.resolve(EMPTY_RESULTS)),
    open ? `search:${network}:${term}` : "search:idle",
  );

  const searching = term.trim().length > 0;
  const hits: SearchHit[] = searching ? results.data?.hits ?? [] : [];
  const rows = searching ? hits.length : DESTINATIONS.length;
  // Clamped at render rather than reset in an effect, so a shrinking result
  // list can never leave the highlight pointing at a row that is not there.
  const active = rows === 0 ? -1 : Math.min(cursor, rows - 1);

  const close = () => {
    setOpen(false);
    writeTerm(null);
  };

  const go = (href: string) => {
    writeTerm(null);
    setOpen(false);
    router.push(href);
  };

  const choose = (index: number) => {
    if (index < 0) return;
    if (searching) {
      const hit = hits[index];
      if (hit) go(hit.href);
      return;
    }
    const dest = DESTINATIONS[index];
    if (dest) go(dest.href === "/feed.json" ? dest.href : withNetworkParam(dest.href, network));
  };

  // ⌘K anywhere, plus the header trigger. Registered once and only while
  // mounted, so nothing is listening on a page that unmounted the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // The term is written to the address while the palette is open, debounced so
  // the history entry is not rewritten on every keystroke.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => writeTerm(term), 250);
    return () => clearTimeout(t);
  }, [open, term]);

  // While the dialog is up the page behind it must not scroll, and closing must
  // hand focus back to whatever opened it.
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      returnTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgba(23,23,23,0.32)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search agents, jobs and transactions"
        className="w-full max-w-[640px] overflow-hidden rounded-xl border shadow-2xl"
        style={{ borderColor: "var(--line-strong)", background: "var(--panel)" }}
      >
        <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: "var(--line)" }}>
          <Search size={15} strokeWidth={2} aria-hidden style={{ color: "var(--ink-3)" }} />
          <input
            autoFocus
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (rows === 0 ? 0 : (Math.min(c, rows - 1) + 1) % rows));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => (rows === 0 ? 0 : (Math.min(c, rows - 1) + rows - 1) % rows));
              } else if (e.key === "Home") {
                e.preventDefault();
                setCursor(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setCursor(Math.max(0, rows - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(active);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-label="Search agents, jobs and transactions"
            placeholder="Search agents, jobs, transactions — or paste an id"
            spellCheck={false}
            autoComplete="off"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ink-3)]"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="rounded p-1 transition-colors hover:bg-black/[0.06]"
            style={{ color: "var(--ink-3)" }}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto">
          {searching && results.error ? (
            <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--bad)" }}>
              The index could not be read: {results.error}
            </p>
          ) : searching && results.loading && !results.data ? (
            <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--ink-2)" }}>
              Searching {networkLabel(network)}…
            </p>
          ) : searching && hits.length === 0 ? (
            <div className="px-6 py-9 text-center">
              <p className="text-[13.5px] font-medium">Nothing matches “{term.trim()}”</p>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Agent ids look like <span className="font-mono">agt_xxxxxx</span>, job ids like{" "}
                <span className="font-mono">job_xxxxx</span>, and transaction ids are 52 characters of
                base32. Handles, addresses and skills all match too.
              </p>
            </div>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className="py-1">
              {searching
                ? hits.map((hit, i) => (
                    <Row
                      key={hit.id}
                      id={`${listId}-${i}`}
                      selected={i === active}
                      onHover={() => setCursor(i)}
                      onPick={() => choose(i)}
                      badge={KIND[hit.kind].label}
                      tone={KIND[hit.kind].tone}
                      title={hit.title}
                      subtitle={hit.subtitle}
                      meta={hit.network === network ? hit.meta : `on ${networkLabel(hit.network)}`}
                      exact={hit.exact}
                    />
                  ))
                : DESTINATIONS.map((d, i) => (
                    <Row
                      key={d.href}
                      id={`${listId}-${i}`}
                      selected={i === active}
                      onHover={() => setCursor(i)}
                      onPick={() => choose(i)}
                      badge="Go to"
                      tone="idle"
                      title={d.title}
                      subtitle={d.subtitle}
                      meta=""
                      exact={false}
                    />
                  ))}
            </ul>
          )}

          {searching && results.data && results.data.more > 0 && (
            <p className="border-t px-4 py-2.5 text-[11.5px]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
              {results.data.more} further match{results.data.more === 1 ? "" : "es"} are not shown here. The
              index pages hold the full result set.
            </p>
          )}
        </div>

        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px]"
          style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
        >
          <Hint keys="↑ ↓" what="move" />
          <Hint keys="↵" what="open" />
          <Hint keys="esc" what="close" />
          <span className="ml-auto">Searching the {networkLabel(network)} capture</span>
        </div>
      </div>
    </div>
  );
}

function Hint({ keys, what }: { keys: string; what: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd
        className="rounded border px-1 py-0.5 font-sans text-[10.5px]"
        style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
      >
        {keys}
      </kbd>
      {what}
    </span>
  );
}

function Row({
  id,
  selected,
  onHover,
  onPick,
  badge,
  tone,
  title,
  subtitle,
  meta,
  exact,
}: {
  id: string;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
  badge: string;
  tone: Tone;
  title: string;
  subtitle: string;
  meta: string;
  exact: boolean;
}) {
  return (
    // Deliberately no key handler of its own: the listbox is driven from the
    // combobox input, which is where focus stays for the whole interaction.
    // A second handler here would double-fire Enter.
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onClick={onPick}
      className="flex cursor-pointer items-center gap-3 px-3 py-2"
      style={{ background: selected ? "var(--wash)" : undefined }}
    >
      <span
        className="w-[58px] flex-none text-[10.5px] font-semibold uppercase tracking-[0.05em] sm:w-[74px]"
        style={{ color: TONE_VAR[tone] }}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {title}
          {exact && (
            <span className="ml-1.5 text-[10.5px] font-semibold uppercase" style={{ color: "var(--accent-deep)" }}>
              exact id
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {subtitle}
        </span>
      </span>
      {meta && (
        <span className="tnum flex-none text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {meta}
        </span>
      )}
      {selected && <CornerDownLeft size={12} strokeWidth={2.4} aria-hidden style={{ color: "var(--ink-3)" }} />}
    </li>
  );
}

/** Writes (or clears) `?k=` without a server round trip. The App Router picks
 *  native history updates up, so the address stays shareable and the back
 *  button is not filled with one entry per keystroke. */
function writeTerm(term: string | null) {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (term == null || term.trim() === "") sp.delete(TERM_PARAM);
  else sp.set(TERM_PARAM, term);
  const qs = sp.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

function withNetworkParam(href: string, network: Network): string {
  if (network === DEFAULT_NETWORK) return href;
  return `${href}${href.includes("?") ? "&" : "?"}network=${network}`;
}
