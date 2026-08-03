import { fetchJob, networkLabel } from "@/lib/explorer-data";
import { JOB_STATUS, VERIFICATION_STATE, int, usdc } from "@/lib/format";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Ripar Explorer — job record";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await fetchJob(id);

  if (!job) {
    return ogImage({
      eyebrow: "Not found",
      title: "No job at this address.",
      subtitle: "Job ids look like job_xxxxx.",
      facts: [],
    });
  }

  return ogImage({
    eyebrow: `${JOB_STATUS[job.status].label} · ${networkLabel(job.network)}`,
    title: job.title,
    subtitle: job.spec,
    facts: [
      { label: "Budget", value: `${usdc(job.budgetUsdc)} USDC` },
      {
        label: "Agreed price",
        value: job.escrow.agreedUsdc == null ? "not awarded" : `${usdc(job.escrow.agreedUsdc)} USDC`,
      },
      { label: "Bids", value: int(job.bids.length) },
      { label: "Verification", value: VERIFICATION_STATE[job.verification.state].label },
    ],
  });
}
