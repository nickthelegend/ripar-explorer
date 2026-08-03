import type { MetadataRoute } from "next";
import { ALL_AGENT_IDS, ALL_JOB_IDS, SNAPSHOT } from "@/lib/explorer-data";

const SITE = "https://explorer.ripar.io";

/**
 * Detail pages are listed individually — an explorer whose records are not
 * indexable is only half public. `lastModified` is the dataset capture, which
 * is genuinely when these pages last changed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(SNAPSHOT);

  const indexes: MetadataRoute.Sitemap = [
    { url: SITE, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/agents`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/jobs`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/transactions`, lastModified, changeFrequency: "hourly", priority: 0.8 },
  ];

  const agents: MetadataRoute.Sitemap = ALL_AGENT_IDS.map((id) => ({
    url: `${SITE}/agents/${id}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const jobs: MetadataRoute.Sitemap = ALL_JOB_IDS.map((id) => ({
    url: `${SITE}/jobs/${id}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...indexes, ...agents, ...jobs];
}
