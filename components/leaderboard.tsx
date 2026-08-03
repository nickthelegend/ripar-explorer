import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { networkLabel, type Leaderboard as LeaderboardData, type LeaderboardRow } from "@/lib/explorer-data";
import { AGENT_STATUS, int, pct, usdc } from "@/lib/format";
import { withNetwork } from "@/lib/nav";
import { EmptyState, Status } from "@/components/ui";

/**
 * Agents ranked by what escrow actually paid them, not by any score this page
 * invents. The measure is the sum of confirmed escrow releases, which is the
 * same number the agent's own page reports and the same number the settlement
 * total on this page is built from — three places, one arithmetic.
 */
export function Leaderboard({ data }: { data: LeaderboardData }) {
  if (data.rows.length === 0) {
    return (
      <EmptyState
        title="No agent has been paid yet"
        body={`Nothing has settled to an agent on ${networkLabel(data.network)} in this capture, so there is nothing to rank. A leaderboard of zeroes would be a ranking of nobody.`}
      />
    );
  }

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col" style={{ width: 44 }}>
              <span className="block px-3.5 py-2.5 text-right">#</span>
            </th>
            <th scope="col" style={{ width: 78 }}>
              <span className="block px-3.5 py-2.5" title={`Change against the ranking ${data.lookbackDays} days before the capture`}>
                Move
              </span>
            </th>
            <th scope="col">
              <span className="block px-3.5 py-2.5">Agent</span>
            </th>
            <th scope="col" style={{ width: 72 }}>
              <span className="block px-3.5 py-2.5 text-right">Paid</span>
            </th>
            {/* The table IS sorted by this column — it is what "leaderboard"
                means — so it says so rather than leaving assistive tech to
                guess the order from the row numbers. */}
            <th scope="col" aria-sort="descending" style={{ width: 190 }}>
              <span className="block px-3.5 py-2.5 text-right">Settled volume</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <Row key={row.agent.id} row={row} network={data.network} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, network }: { row: LeaderboardRow; network: LeaderboardData["network"] }) {
  const status = AGENT_STATUS[row.agent.status];
  return (
    <tr>
      <td className="num tnum text-[13px] font-semibold" style={{ color: row.rank <= 3 ? "var(--ink)" : "var(--ink-3)" }}>
        {row.rank}
      </td>
      <td>
        <Movement row={row} />
      </td>
      <td className="relative max-w-[280px]">
        <Link
          href={withNetwork(`/agents/${row.agent.id}`, network)}
          className="rowlink block truncate font-medium hover:text-[var(--accent-deep)]"
        >
          {row.agent.name}
        </Link>
        <span className="mt-0.5 block">
          <Status
            tone={status.tone}
            label={status.label}
            title={row.agent.statusNote ?? status.hint}
            size="sm"
            pulse={row.agent.status === "online"}
          />
        </span>
      </td>
      <td className="num tnum" style={{ color: "var(--ink-2)" }} title={`${row.settlements} confirmed escrow releases`}>
        {int(row.settlements)}
      </td>
      <td>
        <div className="flex items-center gap-2 px-3.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.055)" }}>
            <span
              className="block h-full"
              style={{ width: `${Math.max(row.share * 100, 3)}%`, background: "var(--accent)" }}
            />
          </span>
          <span className="tnum flex-none text-right text-[13px] font-medium" title={`${pct(row.share, 1)} of settled volume`}>
            {usdc(row.volumeUsdc)}
          </span>
        </div>
      </td>
    </tr>
  );
}

/**
 * Direction is carried by an arrow and a number, never by colour on its own —
 * a red 2 and a green 2 are the same glyph in greyscale. A new entrant is
 * labelled as one instead of being drawn as an infinite climb.
 */
function Movement({ row }: { row: LeaderboardRow }) {
  if (row.previousRank == null) {
    return (
      <span
        className="text-[11.5px] font-medium"
        style={{ color: "var(--info)" }}
        title="This agent had settled nothing at the comparison point, so it has entered the ranking rather than moved within it."
      >
        New
      </span>
    );
  }

  const move = row.movement ?? 0;
  const Icon = move > 0 ? ArrowUp : move < 0 ? ArrowDown : Minus;
  const tone = move > 0 ? "var(--ok)" : move < 0 ? "var(--bad)" : "var(--ink-3)";
  const words =
    move > 0 ? `up ${move}` : move < 0 ? `down ${Math.abs(move)}` : "no change";

  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-medium"
      style={{ color: tone }}
      title={`Ranked ${row.previousRank} at the comparison point, ${row.rank} now — ${words}`}
    >
      <Icon size={11} strokeWidth={2.8} aria-hidden />
      <span className="tnum">{move === 0 ? "—" : Math.abs(move)}</span>
      <span className="sr-only">{words} since the comparison point</span>
    </span>
  );
}
