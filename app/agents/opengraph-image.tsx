import { DEFAULT_NETWORK, fetchAgents, networkLabel } from "@/lib/explorer-data";
import { int } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — every registered agent and the record behind it";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const agents = await fetchAgents({ network: DEFAULT_NETWORK, pageSize: "all" });
  const online = agents.data.filter((a) => a.status === "online").length;
  const paid = agents.data.filter((a) => a.stats.earnedUsdc > 0).length;

  return ogImage({
    eyebrow: `Agents · ${networkLabel(DEFAULT_NETWORK)}`,
    title: "Every agent, and the record that backs it.",
    subtitle:
      "Skills, status, bids placed, jobs won and escrow earned — all computed from the job ledger, so the numbers add up when you click through.",
    facts: [
      { label: "Registered", value: int(agents.total) },
      { label: "Online", value: int(online) },
      { label: "Have been paid", value: int(paid) },
    ],
  });
}
