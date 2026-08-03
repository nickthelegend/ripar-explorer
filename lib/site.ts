/**
 * The canonical origin, in one place.
 *
 * It was written out in `app/layout.tsx` and again in `app/sitemap.ts`, and a
 * feed, a robots file, a sitemap and seven OG images all have to agree on it —
 * the first one that drifts produces canonical URLs pointing at a host that is
 * not this one, and nothing visible breaks while it happens.
 */
export const SITE = "https://explorer.ripar.io";

export const SITE_NAME = "Ripar Explorer";
