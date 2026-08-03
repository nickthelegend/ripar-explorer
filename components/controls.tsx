"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildHref, nextSort, type ViewState } from "@/lib/nav";
import { TONE_VAR, type Tone } from "@/lib/format";

type Ctx = { pathname: string; view: ViewState; defaults: { sort: string } };

/* ── search ────────────────────────────────────────────────────────────── */

/**
 * Debounced, and it uses `replace` rather than `push`. Pushing on every
 * keystroke buries the page you came from under ten history entries and makes
 * the back button useless.
 */
export function SearchInput({ ctx, placeholder }: { ctx: Ctx; placeholder: string }) {
  const router = useRouter();
  const [value, setValue] = useState(ctx.view.q);

  // `ctx` is rebuilt on every render, so depending on it directly would restart
  // the debounce whenever anything else on the page re-rendered — including the
  // chip-count fetch resolving mid-keystroke.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // The URL is the source of truth; a back/forward navigation must win over
  // whatever is sitting in the input.
  useEffect(() => setValue(ctx.view.q), [ctx.view.q]);

  useEffect(() => {
    if (value === ctxRef.current.view.q) return;
    const t = setTimeout(() => {
      const c = ctxRef.current;
      router.replace(buildHref(c.pathname, c.view, { q: value }, c.defaults), { scroll: false });
    }, 220);
    return () => clearTimeout(t);
  }, [value, ctx.view.q, router]);

  return (
    <div className="relative flex-1 sm:max-w-[320px]">
      <Search
        size={14}
        strokeWidth={2}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--ink-3)" }}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        className="h-8 w-full rounded-lg border bg-transparent pl-8 pr-7 text-[13px] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--accent)]"
        style={{ borderColor: "var(--line-strong)" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-black/[0.06]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={13} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

/* ── filter chips ──────────────────────────────────────────────────────── */

export type ChipDef = { value: string; label: string; tone: Tone; count: number };

/** Multi-select. Clicking an active chip removes it; "All" clears the set. */
export function FilterChips({ ctx, options }: { ctx: Ctx; options: ChipDef[] }) {
  const active = ctx.view.status;
  const toggle = (value: string) =>
    active.includes(value) ? active.filter((s) => s !== value) : [...active, value];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={buildHref(ctx.pathname, ctx.view, { status: [] }, ctx.defaults)}
        scroll={false}
        // These are links, not buttons, so the active filter is announced with
        // aria-current; aria-pressed is only valid on a button.
        aria-current={active.length === 0 ? "true" : undefined}
        className="rounded-md border px-2 py-1 text-[12px] font-medium transition-colors"
        style={
          active.length === 0
            ? { borderColor: "var(--accent)", color: "var(--accent-deep)", background: "var(--wash)" }
            : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
        }
      >
        All
      </Link>
      {options.map((o) => {
        const on = active.includes(o.value);
        return (
          <Link
            key={o.value}
            href={buildHref(ctx.pathname, ctx.view, { status: toggle(o.value) }, ctx.defaults)}
            scroll={false}
            aria-current={on ? "true" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors"
            style={
              on
                ? { borderColor: TONE_VAR[o.tone], color: TONE_VAR[o.tone], background: "rgba(0,0,0,0.02)" }
                : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
            }
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: TONE_VAR[o.tone] }} />
            {o.label}
            <span className="tnum" style={{ color: "var(--ink-3)" }}>
              {o.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ── sortable column header ────────────────────────────────────────────── */

/**
 * Rendered as a link, not a button: sorting is part of the address, so a
 * sorted view can be shared and it survives a reload.
 */
export function SortTh({
  ctx,
  column,
  children,
  align = "left",
  width,
}: {
  ctx: Ctx;
  column: string;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const active = ctx.view.sort === column;
  const target = nextSort(ctx.view, column);
  const Icon = active && ctx.view.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" style={{ width }} aria-sort={active ? (ctx.view.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={buildHref(ctx.pathname, ctx.view, target, ctx.defaults)}
        scroll={false}
        className={`flex w-full items-center gap-1 px-3.5 py-2.5 transition-colors hover:text-[var(--ink)] ${
          align === "right" ? "justify-end" : ""
        }`}
        style={active ? { color: "var(--ink)" } : undefined}
      >
        {children}
        <Icon size={11} strokeWidth={2.6} style={{ opacity: active ? 1 : 0.25 }} aria-hidden />
      </Link>
    </th>
  );
}

export function PlainTh({ children, align = "left", width }: { children: React.ReactNode; align?: "left" | "right"; width?: number }) {
  return (
    <th scope="col" style={{ width }}>
      <span className={`block px-3.5 py-2.5 ${align === "right" ? "text-right" : ""}`}>{children}</span>
    </th>
  );
}

/* ── pagination ────────────────────────────────────────────────────────── */

/** `1 … 4 5 6 … 20` once the run is longer than seven pages. */
function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", total];
  if (current >= total - 3) return [1, "gap", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}

export function Pagination({
  ctx,
  page,
  totalPages,
  total,
  pageSize,
  noun,
}: {
  ctx: Ctx;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  noun: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const step = (delta: number) => buildHref(ctx.pathname, ctx.view, { page: page + delta }, ctx.defaults);

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3"
      style={{ borderColor: "var(--line)" }}
    >
      <p className="tnum text-[12px]" style={{ color: "var(--ink-2)" }}>
        {total === 0 ? `No ${noun}` : `${first}–${last} of ${total} ${noun}`}
      </p>
      {totalPages > 1 && (
        <nav className="ml-auto flex items-center gap-1" aria-label="Pagination">
          <PageArrow href={step(-1)} disabled={page <= 1} label="Previous page">
            <ChevronLeft size={14} strokeWidth={2.2} />
          </PageArrow>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                …
              </span>
            ) : (
              <Link
                key={n}
                href={buildHref(ctx.pathname, ctx.view, { page: n }, ctx.defaults)}
                scroll={false}
                aria-current={n === page ? "page" : undefined}
                className="tnum flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-[12px] font-medium transition-colors"
                style={
                  n === page
                    ? { borderColor: "var(--accent-deep)", background: "var(--accent-deep)", color: "#fff" }
                    : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
                }
              >
                {n}
              </Link>
            ),
          )}
          <PageArrow href={step(1)} disabled={page >= totalPages} label="Next page">
            <ChevronRight size={14} strokeWidth={2.2} />
          </PageArrow>
        </nav>
      )}
    </div>
  );
}

function PageArrow({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const style = { borderColor: "var(--line-strong)", color: disabled ? "var(--ink-3)" : "var(--ink-2)" };
  const cls = "flex h-7 w-7 items-center justify-center rounded-md border transition-colors";
  // Without a role, a bare span drops out of the accessibility tree and takes its
  // aria-label and aria-disabled with it, so the control announces as nothing.
  if (disabled) {
    return (
      <span role="button" aria-disabled className={cls} style={{ ...style, opacity: 0.45 }} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} className={cls} style={style} aria-label={label}>
      {children}
    </Link>
  );
}
