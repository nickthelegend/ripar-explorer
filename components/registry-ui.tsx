import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { REGISTRIES, peraApp } from "@/lib/registries";

/**
 * The parts both registry routes share. Kept out of `components/ui.tsx`
 * because they are not generic surfaces — every one of them exists to say
 * "this came off the chain, here is where to check it", which is a claim only
 * these two pages are entitled to make.
 *
 * All server components: the registry pages render per request and none of
 * this needs to be interactive.
 */

/* ── provenance ────────────────────────────────────────────────────────── */

/** Green means real, and it is spelled out as well as coloured. */
export function RealChainBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ background: "rgba(21,128,61,0.12)", color: "var(--ok)" }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      Real chain data
    </span>
  );
}

/**
 * These apps are deployed to TestNet and only TestNet. The header's network
 * switcher moves the sample pages between networks; it cannot move a box that
 * exists in one place, so the network is stated on the page rather than implied
 * by a toggle.
 */
export function TestNetBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
      style={{ borderColor: "var(--line-strong)", color: "var(--ink-2)" }}
    >
      Algorand TestNet
    </span>
  );
}

/** Every identifier on these pages is one click from somewhere that is not us. */
export function Out({
  href,
  children,
  title,
  mono = true,
}: {
  href: string;
  children: ReactNode;
  title?: string;
  mono?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={`inline-flex max-w-full items-center gap-0.5 underline-offset-2 hover:underline ${
        mono ? "font-mono text-[12px]" : "text-[13px]"
      }`}
      style={{ color: "var(--accent-deep)" }}
    >
      <span className="truncate">{children}</span>
      <ArrowUpRight size={11} strokeWidth={2.4} className="flex-none" aria-hidden />
    </a>
  );
}

/* ── navigation between the two onchain views ──────────────────────────── */

export function RegistryTabs({ active }: { active: "agents" | "jobs" }) {
  const tabs = [
    { key: "agents", href: "/registry", label: "Agents" },
    { key: "jobs", href: "/registry/jobs", label: "Job board" },
  ] as const;

  return (
    <nav className="mt-4 flex items-center gap-1" aria-label="Onchain registry views">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className="rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors"
            style={on ? { color: "var(--accent-deep)", background: "var(--wash)" } : { color: "var(--ink-2)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── failure ───────────────────────────────────────────────────────────── */

/**
 * A read that failed says so, names the host and stops. The alternative — an
 * empty table — is indistinguishable from an empty registry, and those are
 * completely different facts.
 */
export function ChainReadError({ what, message }: { what: string; message: string }) {
  return (
    <div
      className="mt-6 rounded-xl border px-4 py-3.5"
      style={{ borderColor: "rgba(192,38,38,0.28)", background: "rgba(192,38,38,0.05)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--bad)" }}>
        Could not read {what}
      </p>
      <p className="mt-1 font-mono text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {message}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Nothing on this page is cached or estimated, so it shows nothing rather than something stale. The
        boxes are still readable directly from any Algorand node.
      </p>
    </div>
  );
}

/* ── sortable header, without any client JavaScript ────────────────────── */

/**
 * Sorting lives in the query string, so a sorted view is a link someone can
 * paste and the back button is correct for free. `aria-sort` is on the cell
 * rather than the anchor because that is where a screen reader looks for it.
 */
export function SortTh({
  href,
  active,
  dir,
  align = "left",
  width,
  children,
}: {
  href: string;
  active: boolean;
  dir: "asc" | "desc";
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  return (
    <th scope="col" style={{ width }} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link
        href={href}
        scroll={false}
        className={`flex w-full items-center gap-1 px-3.5 py-2.5 transition-colors hover:text-[var(--ink)] ${
          align === "right" ? "justify-end" : ""
        }`}
        style={active ? { color: "var(--ink)" } : undefined}
      >
        {children}
        {active && dir === "asc" ? (
          <ArrowUp size={11} strokeWidth={2.6} aria-hidden />
        ) : (
          <ArrowDown size={11} strokeWidth={2.6} style={{ opacity: active ? 1 : 0.25 }} aria-hidden />
        )}
      </Link>
    </th>
  );
}

export function PlainTh({
  children,
  align = "left",
  width,
}: {
  children: ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  return (
    <th scope="col" style={{ width }}>
      <span className={`block px-3.5 py-2.5 ${align === "right" ? "text-right" : ""}`}>{children}</span>
    </th>
  );
}

/* ── the three apps, listed once ───────────────────────────────────────── */

export function RegistryApps({
  counters,
}: {
  /**
   * Global state, already formatted — a counter, a pointer, or why it is
   * absent. Required for all three, so a registry can never appear here with
   * its state quietly left blank.
   */
  counters: Record<keyof typeof REGISTRIES, { label: string; value: string }>;
}) {
  const rows = (Object.keys(REGISTRIES) as Array<keyof typeof REGISTRIES>).map((key) => ({
    key,
    ...REGISTRIES[key],
    counter: counters[key],
  }));

  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full min-w-[720px]">
        <thead>
          <tr>
            <PlainTh width={190}>Registry</PlainTh>
            <PlainTh width={128}>App id</PlainTh>
            <PlainTh>What it holds</PlainTh>
            <PlainTh align="right" width={190}>
              Global state
            </PlainTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium">{r.name}</td>
              <td>
                <Out href={peraApp(r.appId)} title={`Application ${r.appId} on Pera Explorer`}>
                  {r.appId}
                </Out>
              </td>
              <td style={{ color: "var(--ink-2)" }}>{r.role}</td>
              <td className="text-right">
                <span className="text-[12.5px]">
                  <span className="font-mono text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {r.counter.label}{" "}
                  </span>
                  <span className="tnum">{r.counter.value}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
