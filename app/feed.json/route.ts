import {
  DATASET,
  DEFAULT_NETWORK,
  MAX_PAGE_SIZE,
  fetchSettlements,
  isNetwork,
  networkLabel,
  txUrl,
  type Network,
} from "@/lib/explorer-data";
import { TX_KIND, absTime, usdc } from "@/lib/format";
import { SITE } from "@/lib/site";

/**
 * Recent settlements as JSON Feed 1.1 (jsonfeed.org).
 *
 * A feed, not a bespoke JSON dump, because a settlement stream is exactly what
 * a feed is for and every reader already knows the shape. The standard fields
 * carry the human-readable story; `_ripar` carries the numbers a machine would
 * otherwise have to parse back out of the prose.
 *
 * `?network=` selects the capture; `?limit=` trims it. Confirmed settlements
 * only — a rejected release moved nothing, so it did not settle anything. Those
 * are on /transactions, which is where they belong rather than in a feed titled
 * "settlements".
 */

const DEFAULT_LIMIT = 25;

export const dynamic = "force-dynamic";

function readLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, MAX_PAGE_SIZE));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("network");
  const network: Network = isNetwork(raw) ? raw : DEFAULT_NETWORK;
  const limit = readLimit(url.searchParams.get("limit"));

  const settlements = await fetchSettlements(network, limit);
  const suffix = network === DEFAULT_NETWORK ? "" : `?network=${network}`;

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: `Ripar Explorer — settlements on ${networkLabel(network)}`,
    home_page_url: `${SITE}/transactions${suffix}`,
    feed_url: `${SITE}/feed.json${suffix}`,
    description:
      "Confirmed x402 settlements on Algorand: escrow paid out to the winning agent, and escrow returned to the requester. Every record in this feed is from a sample capture, not live traffic.",
    icon: `${SITE}/icon.svg`,
    favicon: `${SITE}/icon.svg`,
    language: "en",
    // Not a usage claim, and it says so in the payload rather than only in the
    // prose on the site — a feed gets read on its own, away from any context.
    _ripar: {
      source: "sample",
      snapshot: DATASET.snapshot,
      network,
      returned: settlements.length,
      limit,
      note: "Sample dataset. Transaction ids are synthetic and do not resolve on a block explorer.",
    },
    items: settlements.map(({ transaction: t, job, agent }) => {
      const kind = TX_KIND[t.kind];
      const who = agent ? agent.name : "the requester";
      const what = job ? `“${job.title}”` : "an unattached escrow";

      return {
        id: `${SITE}/transactions/${t.id}`,
        url: `${SITE}/transactions/${t.id}${suffix}`,
        external_url: txUrl(t.network, t.id),
        title: `${kind.label} · ${usdc(t.amountUsdc)} USDC to ${who}`,
        content_text: [
          `${kind.label} of ${usdc(t.amountUsdc)} USDC${t.protocolFeeUsdc > 0 ? ` (${usdc(t.protocolFeeUsdc)} USDC protocol fee withheld in the same transaction)` : ""} for ${what}.`,
          `Confirmed in round ${t.round} on ${networkLabel(t.network)} at ${absTime(t.timestamp)}.`,
          kind.hint,
        ].join(" "),
        date_published: t.timestamp,
        tags: [t.kind, t.network, ...(job ? job.skillsRequired : [])],
        authors: agent ? [{ name: agent.name, url: `${SITE}/agents/${agent.id}${suffix}` }] : undefined,
        _ripar: {
          transactionId: t.id,
          kind: t.kind,
          network: t.network,
          round: t.round,
          amountUsdc: t.amountUsdc,
          protocolFeeUsdc: t.protocolFeeUsdc,
          feeMicroAlgo: t.feeMicroAlgo,
          from: t.from,
          to: t.to,
          jobId: t.jobId,
          agentId: t.agentId,
          x402: t.x402,
        },
      };
    }),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      // The registered type for JSON Feed. Readers sniff for it.
      "content-type": "application/feed+json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
