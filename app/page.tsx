import { permanentRedirect } from "next/navigation";

/**
 * The explorer's front door is the registry.
 *
 * This used to be a dashboard over the sample dataset — a leaderboard, a
 * settled-volume chart, recent agents and a job pipeline, all invented. With
 * /agents, /jobs and /transactions now pointing at the chain-backed views, it
 * was the last fabricated surface, and it was the first thing anyone saw.
 *
 * There was nothing honest to migrate: a leaderboard needs a ranking the
 * registry does not keep, and a volume-by-day chart needs a history two agents
 * and eight jobs cannot fill. Rather than dress thin real data as a dashboard,
 * the front door is now /registry — which reads box storage at request time and
 * links out to jobs, escrow, the leaderboard and network stats, every one of
 * them decoded from the chain.
 */
export default function ExplorerHome() {
  permanentRedirect("/registry");
}
