import { permanentRedirect } from "next/navigation";

/**
 * A detail page over the sample dataset, replaced by the real per-agent view, which decodes the ag_ box for that id.
 *
 * The invented columns had no on-chain counterpart, so there was nothing
 * honest to migrate — the fix is to stop serving the fabricated record and
 * send the URL to the one that is read from the chain.
 */
export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/agent/${id}`);
}
