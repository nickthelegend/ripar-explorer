/**
 * The A2A agent card, and the one question worth asking about it.
 *
 * An agent card is a self-published JSON document at
 * `https://<domain>/.well-known/agent.json`. Everything in it is a claim the
 * agent makes about itself, including — crucially — the address it wants to be
 * paid at. Nothing stops an operator serving a card that names someone else's
 * domain, or someone else's payout address.
 *
 * The IdentityRegistry is the other half. `new_agent` takes the owner from
 * `Txn.sender`, so the address in an `ag_` box is one an account proved it
 * controlled by signing. Reading the card and the box together turns an
 * unverifiable claim into a check:
 *
 *     does the address this card asks me to pay match the address the chain
 *     says controls this agent id?
 *
 * A mismatch is the exact shape of a payment-redirection attack, and it is why
 * this file reports every disagreement rather than the first one, and never
 * reports "could not reach the card" as if it were "the card agrees".
 */

import { isAlgorandAddress } from "./erc8004";

/** Cards are small. Anything larger is not a card, and is not read into memory. */
const MAX_CARD_BYTES = 512 * 1024;
const TIMEOUT_MS = 8_000;

export const cardUrl = (domain: string) => `https://${domain}/.well-known/agent.json`;

export type PayToClaim = {
  /** Dotted path to the value inside the card, so a reader can find it. */
  path: string;
  value: string;
  /** False when the string is not a well-formed Algorand address at all. */
  wellFormed: boolean;
  matches: boolean;
};

export type CardCheck = {
  url: string;
  /** Every `payTo` found anywhere in the document. */
  payTo: PayToClaim[];
  /** The agent id the card's registry extension claims, when it declares one. */
  claimedAgentId: number | null;
  /** The IdentityRegistry app id the card points at, when it declares one. */
  claimedIdentityApp: number | null;
  /** The asset id the card's x402 extension prices in, when it declares one. */
  claimedAssetId: number | null;
  name: string | null;
  /**
   * - `match`      every payTo equals the registered address
   * - `mismatch`   at least one payTo is a different address — loudest state
   * - `no-payto`   the card parsed but asks for payment nowhere
   * - `unreachable` / `not-json` — we do not know, and must not imply we do
   */
  verdict: "match" | "mismatch" | "no-payto" | "unreachable" | "not-json";
  /** HTTP status, when there was a response at all. */
  status: number | null;
  /** Why the read failed, for the two states where it did. */
  error: string | null;
};

/**
 * Collect every `payTo` in the document, at any depth, with its path.
 *
 * Deliberately not "read `capabilities.extensions[0].params.payTo`". The x402
 * extension is one convention among several and a card is free to carry more
 * than one payment target; a checker that looks in exactly one place reports
 * "no payTo declared" for a card that is in fact asking to be paid, which is
 * the worst possible way to be wrong here.
 */
function collectPayTo(node: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (out.length >= 32) return; // a card with 32 payout targets is not a card
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectPayTo(v, `${path}[${i}]`, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    // `payTo`, `payto`, `pay_to` — the same field, spelled three ways in the
    // wild. Matching on the normalised key catches all of them.
    if (key.toLowerCase().replace(/_/g, "") === "payto" && typeof value === "string") {
      out.push({ path: here, value });
    } else {
      collectPayTo(value, here, out);
    }
  }
}

/** First value at any depth for a key, coerced to a positive integer or null. */
function findNumber(node: unknown, wanted: string): number | null {
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = findNumber(v, wanted);
      if (hit != null) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.toLowerCase().replace(/_/g, "") === wanted) {
      const n = typeof value === "number" ? value : Number.NaN;
      if (Number.isInteger(n) && n > 0) return n;
    }
    const hit = findNumber(value, wanted);
    if (hit != null) return hit;
  }
  return null;
}

/** The x402 extension prices in an asset; the id sits under `asset.id`. */
function findAssetId(node: unknown): number | null {
  if (Array.isArray(node)) {
    for (const v of node) {
      const hit = findAssetId(v);
      if (hit != null) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.toLowerCase() === "asset" && value && typeof value === "object") {
      const id = (value as { id?: unknown }).id;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) return id;
    }
    const hit = findAssetId(value);
    if (hit != null) return hit;
  }
  return null;
}

const unknownCard = (
  url: string,
  verdict: "unreachable" | "not-json",
  error: string,
  status: number | null,
): CardCheck => ({
  url,
  payTo: [],
  claimedAgentId: null,
  claimedIdentityApp: null,
  claimedAssetId: null,
  name: null,
  verdict,
  status,
  error,
});

/**
 * Fetch an agent's card and check it against the address the chain has for it.
 *
 * Server-side only, uncached, and bounded: the domain comes off the chain, so
 * it is attacker-influenced input and gets a timeout, a size cap and an
 * https-only URL. A read that fails returns `unreachable` — never a silent
 * `match`.
 */
export async function checkAgentCard(domain: string, registeredAddress: string): Promise<CardCheck> {
  const url = cardUrl(domain);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unknownCard(url, "unreachable", `"${domain}" is not a hostname a URL can be built from`, null);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) {
    return unknownCard(url, "unreachable", `Refusing to fetch ${parsed.protocol}//${parsed.hostname}`, null);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch (e) {
    const err = e as Error;
    return unknownCard(
      url,
      "unreachable",
      err.name === "TimeoutError" ? `No response within ${TIMEOUT_MS / 1000}s` : err.message,
      null,
    );
  }

  if (!res.ok) {
    // Spelled out rather than left as a bare status line: algod-style hosts and
    // static hosts both answer 404 here, and "404" on its own reads as a broken
    // explorer rather than as a domain that is serving no card.
    const statusText = res.statusText ? ` ${res.statusText}` : "";
    return unknownCard(
      url,
      "unreachable",
      `The domain answered ${res.status}${statusText}, so no card was served there`,
      res.status,
    );
  }

  const body = await res.text();
  if (body.length > MAX_CARD_BYTES) {
    return unknownCard(url, "not-json", `Response is ${body.length} bytes; a card is not`, res.status);
  }

  let card: unknown;
  try {
    card = JSON.parse(body);
  } catch {
    // A 200 that is not JSON is usually a hosting provider's error page, which
    // is a different failure from a card that disagrees and must read as one.
    return unknownCard(url, "not-json", "The response parsed as neither an object nor an array", res.status);
  }

  const found: Array<{ path: string; value: string }> = [];
  collectPayTo(card, "", found);

  const payTo: PayToClaim[] = found.map((f) => ({
    path: f.path,
    value: f.value,
    wellFormed: isAlgorandAddress(f.value),
    matches: f.value === registeredAddress,
  }));

  const name =
    card && typeof card === "object" && typeof (card as { name?: unknown }).name === "string"
      ? ((card as { name: string }).name)
      : null;

  return {
    url,
    payTo,
    claimedAgentId: findNumber(card, "agentid"),
    claimedIdentityApp: findNumber(card, "identityapp"),
    claimedAssetId: findAssetId(card),
    name,
    verdict: payTo.length === 0 ? "no-payto" : payTo.every((p) => p.matches) ? "match" : "mismatch",
    status: res.status,
    error: null,
  };
}
