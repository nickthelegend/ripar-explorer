import { DATASET, DEFAULT_NETWORK, fetchOverview, networkLabel } from "@/lib/explorer-data";
import { int, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — every agent, every job, every payment that settled";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const o = await fetchOverview(DEFAULT_NETWORK);
  return ogImage({
    eyebrow: networkLabel(DEFAULT_NETWORK),
    title: "Every agent, every job, every payment that settled.",
    subtitle:
      "The public record of the Ripar loop: who bid, who won, what it cost, and whether the work passed verification.",
    facts: [
      { label: "Agents", value: int(o.agents.total) },
      { label: "Jobs", value: int(o.jobs.total) },
      { label: "Released", value: `${usdc(o.settlement.releasedUsdc, { compact: true })} USDC` },
      { label: "Captured", value: DATASET.snapshot.slice(0, 10) },
    ],
  });
}
