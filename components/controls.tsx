"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { buildHref, nextSort, type ViewState } from "@/lib/nav";
import { TONE_VAR, usdc, type Tone } from "@/lib/format";

type Ctx = { pathname: string; view: ViewState; defaults: { sort: string } };

/* ── search ────────────────────────────────────────────────────────────── */

/** The free-text filter. The URL is the source of truth; this box is a draft of
 *  the next URL that has not been committed yet. */
export function SearchInput({ ctx, placeholder }: { ctx: Ctx; placeholder: string }) {
  const router = useRouter();

  /**
   * What has been typed but not yet written to the URL, tagged with the URL
   * value it was typed against. The tag is what lets a back/forward navigation
   * win: the moment the address changes for any reason other than this box's
   * own commit, the draft stops matching and the URL is shown instead. No
   * effect races the input, so nothing can overwrite a keystroke mid-type.
   */
  const [draft, setDraft] = useState<{ text: string; against: string } | null>(null);
  const committed = ctx.view.q;
  const value = draft && draft.against === committed ? draft.text : committed;

  // Computed during render so the effect can depend on a plain string. `ctx` is
  // rebuilt every render, and depending on it would restart the debounce
  // whenever anything else re-rendered — including the chip-count fetch
  // resolving mid-keystroke, which is how a typed query used to get lost.
  const target = buildHref(ctx.pathname, ctx.view, { q: value }, ctx.defaults);

  /**
   * Debounced, and it uses `replace` rather than `push`. Pushing on every
   * keystroke buries the page you came from under ten history entries and makes
   * the back button useless.
   */
  useEffect(() => {
    if (value === committed) return;
    const t = setTimeout(() => router.replace(target, { scroll: false }), 220);
    return () => clearTimeout(t);
  }, [value, committed, target, router]);

  const type = (text: string) => setDraft({ text, against: committed });

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
        onChange={(e) => type(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        className="h-8 w-full rounded-lg border bg-transparent pl-8 pr-7 text-[13px] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--accent)]"
        style={{ borderColor: "var(--line-strong)" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => type("")}
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

/* ── skill filter ──────────────────────────────────────────────────────── */

/**
 * A disclosure rather than a dropdown, and it expands in the flow of the
 * toolbar rather than floating over it. The toolbar lives inside a Panel, and a
 * Panel clips its own overflow — an absolutely positioned menu would have been
 * sliced off at the first hairline.
 *
 * Each skill is a link, like the status chips, so a skill filter is part of the
 * address and survives a reload.
 */
export function SkillFilter({
  ctx,
  options,
  loading = false,
}: {
  ctx: Ctx;
  options: { value: string; count: number }[];
  loading?: boolean;
}) {
  const active = ctx.view.skills;
  const [open, setOpen] = useState(active.length > 0);
  const panelId = useId();

  const toggle = (value: string) =>
    active.includes(value) ? active.filter((s) => s !== value) : [...active, value];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors"
        style={
          active.length
            ? { borderColor: "var(--accent)", color: "var(--accent-deep)", background: "var(--wash)" }
            : { borderColor: "var(--line-strong)", color: "var(--ink-2)" }
        }
      >
        {open ? "Hide skills" : "Filter by skill"}
        {active.length > 0 && <span className="tnum">{active.length}</span>}
        <ChevronDown
          size={12}
          strokeWidth={2.4}
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div id={panelId} className="w-full basis-full">
          {loading ? (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              Reading the skills posted on this network…
            </p>
          ) : options.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              No job on this network names a required skill.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => {
                const on = active.includes(o.value);
                return (
                  <Link
                    key={o.value}
                    href={buildHref(ctx.pathname, ctx.view, { skills: toggle(o.value) }, ctx.defaults)}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    title={`${o.count} job${o.count === 1 ? "" : "s"} require ${o.value}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11.5px] transition-colors"
                    style={
                      on
                        ? { borderColor: "var(--accent)", color: "var(--accent-deep)", background: "var(--wash)" }
                        : { borderColor: "var(--line)", color: "var(--ink-2)", background: "var(--panel-2)" }
                    }
                  >
                    {o.value}
                    <span className="tnum" style={{ color: "var(--ink-3)" }}>
                      {o.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ── budget range ──────────────────────────────────────────────────────── */

const numberOrNull = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Two bounds and a button that names what it does. Submitted rather than
 * live-filtered: a range is two numbers, and refiltering the table on the first
 * digit of the second one is noise, not responsiveness.
 */
export function BudgetRange({ ctx, bounds }: { ctx: Ctx; bounds: { min: number; max: number } | null }) {
  const router = useRouter();
  const minId = useId();
  const maxId = useId();

  // Same tagged-draft trick as the search box: the typed values are shown only
  // while the address they were typed against is still the current one, so a
  // back navigation restores the range that URL actually carries.
  const committed = `${ctx.view.min ?? ""}|${ctx.view.max ?? ""}`;
  const [draft, setDraft] = useState<{ min: string; max: string; against: string } | null>(null);
  const live = draft && draft.against === committed ? draft : null;
  const minText = live ? live.min : ctx.view.min?.toString() ?? "";
  const maxText = live ? live.max : ctx.view.max?.toString() ?? "";

  const set = (patch: { min?: string; max?: string }) =>
    setDraft({ min: patch.min ?? minText, max: patch.max ?? maxText, against: committed });

  const field =
    "h-8 w-[86px] rounded-lg border bg-transparent px-2 text-[12.5px] tabular-nums outline-none transition-colors focus:border-[var(--accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          buildHref(
            ctx.pathname,
            ctx.view,
            { min: numberOrNull(minText), max: numberOrNull(maxText) },
            ctx.defaults,
          ),
          { scroll: false },
        );
      }}
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        Budget
      </span>
      <label className="sr-only" htmlFor={minId}>
        Minimum budget in USDC
      </label>
      <input
        id={minId}
        value={minText}
        onChange={(e) => set({ min: e.target.value })}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        placeholder={bounds ? usdc(bounds.min, { compact: true }) : "min"}
        className={field}
        style={{ borderColor: "var(--line-strong)" }}
      />
      <span aria-hidden className="text-[12px]" style={{ color: "var(--ink-3)" }}>
        –
      </span>
      <label className="sr-only" htmlFor={maxId}>
        Maximum budget in USDC
      </label>
      <input
        id={maxId}
        value={maxText}
        onChange={(e) => set({ max: e.target.value })}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        placeholder={bounds ? usdc(bounds.max, { compact: true }) : "max"}
        className={field}
        style={{ borderColor: "var(--line-strong)" }}
      />
      <button
        type="submit"
        className="rounded-md border px-2 py-1 text-[12px] font-medium transition-colors"
        style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
      >
        Apply budget range
      </button>
    </form>
  );
}

/* ── active filter summary ─────────────────────────────────────────────── */

/**
 * Everything currently narrowing the table, each with the one control that
 * removes it. Without this a skill filter set three scrolls ago is invisible
 * and the empty table looks like missing data.
 */
export function ActiveFilters({ ctx, noun }: { ctx: Ctx; noun: string }) {
  const { q, status, skills, min, max } = ctx.view;
  const anything = Boolean(q) || status.length > 0 || skills.length > 0 || min != null || max != null;
  if (!anything) return null;

  const pill = (key: string, label: string, patch: Partial<ViewState>) => (
    <Link
      key={key}
      href={buildHref(ctx.pathname, ctx.view, patch, ctx.defaults)}
      scroll={false}
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium transition-colors"
      style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
    >
      {label}
      <X size={11} strokeWidth={2.4} aria-hidden />
    </Link>
  );

  return (
    <div className="flex w-full basis-full flex-wrap items-center gap-1.5">
      <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Filtering {noun} by
      </span>
      {q && pill("q", `search “${q}”`, { q: "" })}
      {status.map((s) => pill(`status-${s}`, s, { status: status.filter((x) => x !== s) }))}
      {skills.map((s) => pill(`skill-${s}`, s, { skills: skills.filter((x) => x !== s) }))}
      {(min != null || max != null) &&
        pill(
          "budget",
          min != null && max != null
            ? `${usdc(min, { compact: true })}–${usdc(max, { compact: true })} USDC`
            : min != null
              ? `${usdc(min, { compact: true })} USDC and up`
              : `up to ${usdc(max!, { compact: true })} USDC`,
          { min: null, max: null },
        )}
      <Link
        href={buildHref(ctx.pathname, ctx.view, { q: "", status: [], skills: [], min: null, max: null }, ctx.defaults)}
        scroll={false}
        className="text-[11.5px] font-medium underline underline-offset-2"
        style={{ color: "var(--accent-deep)" }}
      >
        Clear all filters
      </Link>
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
