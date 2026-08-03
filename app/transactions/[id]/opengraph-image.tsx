import { fetchTransaction, networkLabel } from "@/lib/explorer-data";
import { TX_KIND, TX_STATUS, int, shortAddr, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — settlement record";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = await fetchTransaction(id);

  if (!tx) {
    return ogImage({
      eyebrow: "Not found",
      title: "No transaction at this address.",
      subtitle: "Transaction ids are 52 characters of base32.",
      facts: [],
    });
  }

  const kind = TX_KIND[tx.kind];

  return ogImage({
    eyebrow: `${TX_STATUS[tx.status].label} · ${networkLabel(tx.network)}`,
    title: `${kind.label} · ${usdc(tx.amountUsdc)} USDC`,
    // A rejected payment moved nothing, and the card should not read as though
    // it did.
    subtitle: tx.status === "failed" ? (tx.failureReason ?? kind.hint) : kind.hint,
    facts: [
      { label: "Round", value: int(tx.round) },
      { label: "Protocol fee", value: tx.protocolFeeUsdc ? `${usdc(tx.protocolFeeUsdc)} USDC` : "none" },
      { label: "To", value: shortAddr(tx.to, 8, 6) },
    ],
  });
}
