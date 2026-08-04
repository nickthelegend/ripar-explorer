import { networkLabel, type VolumeSeries } from "@/lib/explorer-data";
import { absTime, int, shortDate, usdc } from "@/lib/format";
import { EmptyState } from "@/components/ui";

/**
 * Settled volume over the capture window, drawn from the transaction ledger
 * rather than decorating it.
 *
 * Two things follow from that and are worth stating, because the temptation in
 * both directions is to fake it:
 *
 *  - Empty days are drawn as empty days. This dataset settles in bursts, and a
 *    chart that dropped the quiet days would show a steady drumbeat of work
 *    that never happened.
 *  - The axis is scaled to the largest single day and labelled with its actual
 *    value. No baseline padding, no minimum bar height for "presence" — a day
 *    that settled nothing is a day at zero.
 *
 * Hand-drawn SVG: a chart library for one series of a dozen points is a
 * megabyte of dependency to draw thirteen rectangles.
 */

/** Sized to the content column it sits in, so at desktop width one SVG unit is
 *  about one CSS pixel and the labels are the size they say they are. */
const W = 1180;
const H = 236;
const PAD = { top: 16, right: 62, bottom: 32, left: 62 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Rounds an axis maximum up to 1, 2 or 5 × a power of ten, so the gridline
 *  labels are numbers a person would have chosen. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

export function VolumeChart({ series }: { series: VolumeSeries }) {
  if (series.points.length === 0) {
    return (
      <EmptyState
        title="Nothing has settled on this network yet"
        body={`No escrow release has been recorded on ${networkLabel(series.network)} in this capture, so there is no volume to plot. The chart appears the moment the first job settles.`}
      />
    );
  }

  const points = series.points;
  const axisMax = niceMax(series.peakUsdc);
  const slot = PLOT_W / points.length;
  const barW = Math.max(3, Math.min(30, slot * 0.56));

  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const yBar = (v: number) => PAD.top + PLOT_H - (v / axisMax) * PLOT_H;
  const yLine = (v: number) => PAD.top + PLOT_H - (series.totalUsdc ? v / series.totalUsdc : 0) * PLOT_H;

  const gridlines = [0, 0.5, 1];
  const line = points.map((p, i) => `${x(i).toFixed(1)},${yLine(p.cumulativeUsdc).toFixed(1)}`).join(" ");

  // First, last, and roughly four in between — any denser and the labels
  // collide at the width this panel actually gets.
  const tickEvery = Math.max(1, Math.ceil(points.length / 5));
  const isTick = (i: number) => i === 0 || i === points.length - 1 || i % tickEvery === 0;

  const summary = `Escrow released to agents on ${networkLabel(series.network)}, by UTC day: ${usdc(series.totalUsdc)} USDC across ${series.settlements} settlements, on ${series.activeDays} of ${points.length} days. Busiest day ${usdc(series.peakUsdc)} USDC.`;

  return (
    <figure className="m-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3.5 text-[11.5px]" style={{ color: "var(--ink-2)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: "var(--accent)" }} />
          Released that day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ width: 14, height: 2, borderRadius: 2, background: "var(--info)" }} />
          Running total
        </span>
        <span className="ml-auto tnum" style={{ color: "var(--ink-3)" }}>
          {usdc(series.totalUsdc)} USDC over {points.length} days
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={summary}
        className="block px-2 pb-1"
        style={{ height: "auto" }}
      >
        {gridlines.map((g) => {
          const y = PAD.top + PLOT_H - g * PLOT_H;
          return (
            <g key={g}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke={g === 0 ? "var(--line-strong)" : "var(--line)"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize={11}
                fill="var(--ink-3)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {usdc(axisMax * g, { compact: true })}
              </text>
            </g>
          );
        })}

        {/* Right axis belongs to the running total, and says so rather than
            leaving two scales sharing one unlabelled frame. */}
        <text
          x={W - PAD.right + 8}
          y={PAD.top + 4}
          fontSize={11}
          fill="var(--info)"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {usdc(series.totalUsdc, { compact: true })}
        </text>
        <text x={W - PAD.right + 8} y={PAD.top + 17} fontSize={10} fill="var(--ink-3)">
          total
        </text>

        {points.map((p, i) => {
          const empty = p.releasedUsdc === 0;
          const top = empty ? PAD.top + PLOT_H - 1.5 : yBar(p.releasedUsdc);
          return (
            <rect
              key={p.day}
              x={x(i) - barW / 2}
              y={top}
              width={barW}
              height={Math.max(1.5, PAD.top + PLOT_H - top)}
              rx={2}
              fill={empty ? "var(--line-strong)" : "var(--accent)"}
            >
              <title>
                {`${shortDate(p.day)}: ${empty ? "no settlements" : `${usdc(p.releasedUsdc)} USDC across ${p.settlements} settlement${p.settlements === 1 ? "" : "s"}`}`}
              </title>
            </rect>
          );
        })}

        <polyline points={line} fill="none" stroke="var(--info)" strokeWidth={1.6} strokeLinejoin="round" />
        {points.map((p, i) =>
          p.settlements > 0 ? (
            <circle key={p.day} cx={x(i)} cy={yLine(p.cumulativeUsdc)} r={2.6} fill="var(--info)" />
          ) : null,
        )}

        {points.map((p, i) =>
          isTick(i) ? (
            <text
              key={p.day}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--ink-3)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {shortDate(p.day)}
            </text>
          ) : null,
        )}
      </svg>

      {/* The same numbers as a table, for anyone who cannot use the picture.
          A chart with no readable equivalent is a chart half the audience is
          simply locked out of.

          sr-only sits on a wrapping div, not on the table: in auto table layout
          `width` is a minimum rather than a maximum, so a table carrying sr-only
          keeps its full content width — here ~860px — and inflates
          documentElement.scrollWidth past the viewport even though clip-path
          hides it. A block-level div honours the 1px and actually collapses. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Day (UTC)</th>
              <th scope="col">Released, USDC</th>
              <th scope="col">Settlements</th>
              <th scope="col">Running total, USDC</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <th scope="row">{absTime(p.day)}</th>
                <td>{usdc(p.releasedUsdc)}</td>
                <td>{int(p.settlements)}</td>
                <td>{usdc(p.cumulativeUsdc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption className="border-t px-4 py-2.5 text-[11.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
        {series.activeDays} of {points.length} days in the capture window saw a settlement. The gaps are
        real: this sample settles in bursts, and flattening them would describe traffic that is not there.
      </figcaption>
    </figure>
  );
}
