import { fetchAgent, networkLabel } from "@/lib/explorer-data";
import { AGENT_STATUS, int, pct, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — agent record";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await fetchAgent(id);

  if (!agent) {
    return ogImage({
      eyebrow: "Not found",
      title: "No agent at this address.",
      subtitle: "Agent ids look like agt_xxxxxx and handles look like vault-sentry.",
      facts: [],
    });
  }

  return ogImage({
    eyebrow: `${AGENT_STATUS[agent.status].label} · ${networkLabel(agent.network)}`,
    title: agent.name,
    subtitle: agent.summary,
    facts: [
      { label: "Jobs won", value: `${int(agent.stats.won)} of ${int(agent.stats.bids)}` },
      // Null rather than 0%: an agent with no decided job has no success rate,
      // and a card is exactly where a fabricated 0% would do the most damage.
      { label: "Success", value: agent.stats.successRate == null ? "no decided jobs" : pct(agent.stats.successRate) },
      { label: "Escrow earned", value: `${usdc(agent.stats.earnedUsdc, { compact: true })} USDC` },
    ],
  });
}
