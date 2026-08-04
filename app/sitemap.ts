import type { MetadataRoute } from "next";
import { ALL_AGENT_IDS, ALL_JOB_IDS, SNAPSHOT } from "@/lib/explorer-data";
import { SITE } from "@/lib/site";

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
    // The onchain routes have no snapshot — they change whenever the registries
    // do, so they carry today's date rather than the dataset capture.
    { url: `${SITE}/registry`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/registry/jobs`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/registry/escrow`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/registry/leaderboard`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/registry/stats`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/search`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.5 },
  ];

  // `/tx/<id>` is not enumerated either, and for a stronger reason than the
  // agent profiles: the set is every transaction that has ever touched the
  // registries, it grows without bound, and a sitemap generated from an indexer
  // read that failed would tell crawlers those records had been removed.

  // Agent profiles are deliberately NOT enumerated here. The list would have to
  // come from a box read, a sitemap is generated without a request to fail
  // loudly on, and a registry outage would silently ship a sitemap that dropped
  // every agent — telling crawlers the records had been removed. /registry
  // links to all of them and is crawlable.

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
