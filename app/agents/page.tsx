import { permanentRedirect } from "next/navigation";

/**
 * This page used to render a fabricated dataset.
 *
 * The explorer has always had two lists of the same thing: this one, built from
 * a sample dataset with invented statuses, success rates and operators, and the
 * registry views, which decode the live IdentityRegistry out of box storage at
 * request time. Both were reachable, the sample one was linked first, and the
 * disclosure was a line of footer text — so the first list a visitor saw was
 * the one that was made up.
 *
 * Fields like "success rate" and "operator" have no counterpart on chain, so
 * there was nothing honest to migrate: keeping the columns would have meant
 * keeping the invention. The page now sends people to the list that is real.
 * The URL still resolves, so existing links do not break.
 */
export default function AgentsPage() {
  permanentRedirect("/registry");
}
