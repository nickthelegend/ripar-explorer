import type { ReactNode } from "react";
import { TONE_VAR, type Tone } from "@/lib/format";

/* ── status ────────────────────────────────────────────────────────────── */

/**
 * Status is a dot AND its written label, always. Colour alone fails for the
 * ~4% of readers who cannot separate the greens from the ambers, and it fails
 * for everyone in a screenshot pasted into a monochrome doc.
 */
export function Status({
  tone,
  label,
  title,
  pulse = false,
  size = "md",
}: {
  tone: Tone;
  label: string;
  title?: string;
  pulse?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}
      style={{ color: TONE_VAR[tone] }}
      title={title}
    >
      <span
        aria-hidden
        className={pulse ? "beat" : undefined}
        style={{
          width: size === "sm" ? 6 : 7,
          height: size === "sm" ? 6 : 7,
          borderRadius: 99,
          background: TONE_VAR[tone],
          flex: "none",
        }}
      />
      <span className="font-medium">{label}</span>
    </span>
  );
}

/* ── surfaces ──────────────────────────────────────────────────────────── */

export function Panel({
  title,
  action,
  children,
  note,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  note?: string;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border ${className}`}
      style={{ borderColor: "var(--line)", background: "var(--panel)" }}
    >
      {title && (
        <header
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {note && (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              {note}
            </p>
          )}
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Label above value. Values that are identifiers get `mono`. */
export function Field({
  label,
  children,
  mono = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.05em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd className={`mt-1 text-[13.5px] break-words ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
      {hint && (
        <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A figure with its unit and a one-line explanation of what it counts. */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border px-4 py-3.5" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <p className="text-[11px] font-medium uppercase tracking-[0.05em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="tnum text-[26px] font-semibold leading-none tracking-tight"
          style={{ color: tone ? TONE_VAR[tone] : "var(--ink)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
            {unit}
          </span>
        )}
      </p>
      {sub && (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── async states ──────────────────────────────────────────────────────── */

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {body}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: ReactNode }) {
  return (
    <div
      className="m-4 rounded-lg border px-4 py-4"
      style={{ borderColor: "rgba(192,38,38,0.28)", background: "rgba(192,38,38,0.05)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--bad)" }}>
        Could not read the index
      </p>
      <p className="mt-1 font-mono text-[12px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {message}
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Nothing on this page is cached, so it stops rather than showing you a stale answer.
      </p>
      {retry && <div className="mt-3">{retry}</div>}
    </div>
  );
}

/** Placeholder rows sized to the real ones, so the table does not jump on load. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <table className="tbl">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <div
                  className="skel h-3"
                  style={{ width: `${c === 0 ? 62 : 28 + ((r * 7 + c * 13) % 22)}%`, animationDelay: `${r * 60}ms` }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── small parts ───────────────────────────────────────────────────────── */

export function Chip({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
      style={{
        color: tone ? TONE_VAR[tone] : "var(--ink-2)",
        background: "var(--panel-2)",
        border: "1px solid var(--line)",
      }}
    >
      {children}
    </span>
  );
}

/** A bar that reads its own number out loud rather than relying on width. */
export function Meter({ value, tone = "ok", label }: { value: number; tone?: Tone; label: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>
          {label}
        </span>
        <span className="tnum text-[12px] font-medium" style={{ color: TONE_VAR[tone] }}>
          {(clamped * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.07)" }}>
        <div style={{ width: `${clamped * 100}%`, height: "100%", background: TONE_VAR[tone] }} />
      </div>
    </div>
  );
}
