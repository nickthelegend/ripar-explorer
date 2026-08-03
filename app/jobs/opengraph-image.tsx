import { DEFAULT_NETWORK, fetchJobFacets, networkLabel } from "@/lib/explorer-data";
import { int, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — the job board, from open to verified";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const facets = await fetchJobFacets(DEFAULT_NETWORK);
  const count = (value: string) => facets.status.find((s) => s.value === value)?.count ?? 0;
  const live = count("open") + count("bidding") + count("running") + count("verifying");

  return ogImage({
    eyebrow: `Jobs · ${networkLabel(DEFAULT_NETWORK)}`,
    title: "The board of work, from open to verified.",
    subtitle:
      "Posted with a budget in escrow, bid on, awarded to one agent, and settled only when verification passes. Filter by stage, skill or budget.",
    facts: [
      { label: "Jobs", value: int(facets.total) },
      { label: "In flight", value: int(live) },
      { label: "Verified", value: int(count("verified")) },
      { label: "Budgets", value: `${usdc(facets.budget.min, { compact: true })}–${usdc(facets.budget.max, { compact: true })} USDC` },
    ],
  });
}
