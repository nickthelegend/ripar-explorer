import { permanentRedirect } from "next/navigation";

/**
 * A detail page over the sample dataset, replaced by the real job board, which reads jb_ and es_ boxes at request time.
 *
 * The invented columns had no on-chain counterpart, so there was nothing
 * honest to migrate — the fix is to stop serving the fabricated record and
 * send the URL to the one that is read from the chain.
 */
export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  permanentRedirect(`/registry/jobs`);
}
