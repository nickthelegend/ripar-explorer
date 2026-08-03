import { DEFAULT_NETWORK, fetchOverview, networkLabel } from "@/lib/explorer-data";
import { int, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — every x402 settlement, confirmed and rejected";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const o = await fetchOverview(DEFAULT_NETWORK);

  return ogImage({
    eyebrow: `Transactions · ${networkLabel(DEFAULT_NETWORK)}`,
    title: "Every x402 settlement, including the rejected ones.",
    subtitle:
      "Budgets committed to escrow, agents paid their agreed price net of protocol fee, and unspent budget returned — each row linking out to allo.info.",
    facts: [
      { label: "Transactions", value: int(o.settlement.transactions) },
      { label: "Rejected", value: int(o.settlement.failedTransactions) },
      { label: "Released", value: `${usdc(o.settlement.releasedUsdc, { compact: true })} USDC` },
      { label: "Refunded", value: `${usdc(o.settlement.refundedUsdc, { compact: true })} USDC` },
    ],
  });
}
