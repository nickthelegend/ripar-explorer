import { DEFAULT_NETWORK, isNetwork, type ListQuery, type Network, type SortDir } from "./explorer-data";

/**
 * Every list control lives in the query string — search, status filter, sort,
 * page, network. That makes every view a link someone can paste into a ticket,
 * and it makes the back button correct for free.
 */
export type ViewState = {
  network: Network;
  q: string;
  status: string[];
  /** Job board only; empty everywhere else. */
  skills: string[];
  /** Job board only. Inclusive budget bounds in USDC; null means unbounded. */
  min: number | null;
  max: number | null;
  sort: string;
  dir: SortDir;
  page: number;
};

/** A budget bound the data layer can use, or null. Rejects text, negatives and
 *  NaN rather than passing them through to a filter that would drop every row. */
function readBound(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function readView(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
  fallbackSort: string,
  allowedSorts?: readonly string[],
): ViewState {
  const get = (k: string) => params.get(k);
  const network = isNetwork(get("network")) ? (get("network") as Network) : DEFAULT_NETWORK;
  const list = (k: string) => (get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const page = Number.parseInt(get("page") ?? "1", 10);
  const sort = get("sort") ?? "";
  const min = readBound(get("min"));
  const max = readBound(get("max"));
  return {
    network,
    q: get("q") ?? "",
    status: list("status"),
    skills: list("skills"),
    // A reversed range filters everything out and reads as a broken page, so it
    // is corrected here rather than obeyed.
    min: min != null && max != null && min > max ? max : min,
    max: min != null && max != null && min > max ? min : max,
    // A `?sort=` the data layer would reject must be rejected here too, or the
    // header arrows point at a column the rows are not actually sorted by.
    sort: sort && (!allowedSorts || allowedSorts.includes(sort)) ? sort : fallbackSort,
    dir: get("dir") === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Minimal shape shared by URLSearchParams and Next's ReadonlyURLSearchParams. */
type ReadonlyURLSearchParamsLike = { get(name: string): string | null };

/**
 * Builds the next URL from the current one. Defaults are omitted rather than
 * written, so the common view has a clean address bar and `/agents` and
 * `/agents?network=testnet&page=1` never compete as two URLs for one page.
 */
export function buildHref(
  pathname: string,
  current: ViewState,
  patch: Partial<ViewState>,
  defaults: { sort: string },
): string {
  const next: ViewState = { ...current, ...patch };
  // Any change to what is being filtered invalidates the page cursor.
  const NARROWING: (keyof ViewState)[] = ["q", "status", "skills", "min", "max", "sort", "dir"];
  if (NARROWING.some((k) => patch[k] !== undefined)) {
    next.page = patch.page ?? 1;
  }

  const sp = new URLSearchParams();
  if (next.network !== DEFAULT_NETWORK) sp.set("network", next.network);
  if (next.q) sp.set("q", next.q);
  if (next.status.length) sp.set("status", next.status.join(","));
  if (next.skills.length) sp.set("skills", next.skills.join(","));
  if (next.min != null) sp.set("min", String(next.min));
  if (next.max != null) sp.set("max", String(next.max));
  if (next.sort !== defaults.sort) sp.set("sort", next.sort);
  if (next.dir !== "desc") sp.set("dir", next.dir);
  if (next.page > 1) sp.set("page", String(next.page));

  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * `ViewState` is what the address looks like; `ListQuery` is what the data
 * layer takes. The translation lives here once — a filter that is in the URL
 * but never reaches the query is the quietest bug this page can have.
 */
export function toQuery(view: ViewState): ListQuery {
  return {
    network: view.network,
    q: view.q,
    status: view.status,
    skills: view.skills,
    minBudget: view.min,
    maxBudget: view.max,
    sort: view.sort,
    dir: view.dir,
    page: view.page,
  };
}

/** Carries the selected network onto a link that has no other view state. */
export function withNetwork(href: string, network: Network): string {
  if (network === DEFAULT_NETWORK) return href;
  return `${href}${href.includes("?") ? "&" : "?"}network=${network}`;
}

/** Clicking the active sort column flips direction; a new column starts descending. */
export function nextSort(current: ViewState, column: string): { sort: string; dir: SortDir } {
  if (current.sort !== column) return { sort: column, dir: "desc" };
  return { sort: column, dir: current.dir === "desc" ? "asc" : "desc" };
}
