import { NextResponse } from "next/server";

/**
 * Fetch a URL and decode whatever x402 challenge it answers with.
 *
 * Server-side because the point is to decode SOMEBODY ELSE'S endpoint. A browser
 * fetch to an arbitrary origin is blocked before it reaches the paywall, and the
 * failure looks like the endpoint is down rather than like CORS — which would
 * make this tool lie about the thing it exists to inspect.
 *
 * Nothing is signed and nothing is paid: the request goes out with no payment
 * header precisely so the endpoint answers 402 with its terms.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Both spellings, because they are different protocol versions, not casings. */
const V2_HEADER = "payment-required";
const V1_HEADER = "x-payment-required";

const TIMEOUT_MS = 10_000;

/**
 * Ask the chain what an asset calls itself.
 *
 * A challenge names the asset by id and does not have to carry a ticker. When it
 * does not, the choice is between printing "units" and asking the network the
 * asset lives on. Asking is better and is still a fact: the unit name comes from
 * the ASA's own parameters, not from a table of ids we maintain.
 *
 * Only Algorand networks are resolvable here. A challenge on some other chain
 * keeps whatever symbol it stated, or none.
 */
async function assetSymbol(network: string | undefined, assetId: string | undefined) {
  if (!network?.startsWith("algorand:") || !assetId || !/^\d+$/.test(assetId)) return null;
  const host = network.includes("SGO1GKSz")
    ? "https://testnet-api.algonode.cloud"
    : "https://mainnet-api.algonode.cloud";
  try {
    const r = await fetch(`${host}/v2/assets/${assetId}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { params?: { "unit-name"?: string; decimals?: number } };
    return {
      symbol: j.params?.["unit-name"] ?? null,
      decimals: j.params?.decimals ?? null,
    };
  } catch {
    return null;
  }
}
const MAX_BODY = 4096;

type Accept = {
  scheme?: string;
  network?: string;
  payTo?: string;
  asset?: string;
  maxAmountRequired?: string | number;
  amount?: string | number;
  resource?: string;
  description?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; symbol?: string; decimals?: number } & Record<string, unknown>;
};

export async function POST(request: Request) {
  let target: string;
  try {
    const body = (await request.json()) as { url?: string };
    target = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a `url`." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json(
      { error: "That is not a URL. Include the scheme, e.g. https://api.ripar.io/api/summarize." },
      { status: 400 },
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: `${parsed.protocol} is not a protocol this can request.` }, { status: 400 });
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      // A real body, so a 402 is the paywall answering rather than a validator
      // rejecting an empty payload — those are different answers and only one of
      // them is what this tool is asking about.
      body: JSON.stringify({ text: "Decoding this endpoint's x402 terms." }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const reason = (err as Error).name === "TimeoutError"
      ? `did not answer within ${TIMEOUT_MS / 1000}s`
      : (err as Error).message;
    return NextResponse.json({ error: `${parsed.host} ${reason}.` }, { status: 502 });
  }

  const ms = Date.now() - started;
  const raw = res.headers.get(V2_HEADER) ?? res.headers.get(V1_HEADER);
  const version = res.headers.get(V2_HEADER) ? 2 : res.headers.get(V1_HEADER) ? 1 : null;
  const bodyText = (await res.text().catch(() => "")).slice(0, MAX_BODY);

  if (res.status !== 402) {
    return NextResponse.json({
      url: parsed.toString(), status: res.status, ms, gated: false,
      note: res.status < 400
        ? "This endpoint answered without asking for payment, so it is not x402-gated — or the paywall is off."
        : `This endpoint answered ${res.status}, which is not a payment challenge.`,
      bodyPreview: bodyText.slice(0, 400),
    });
  }

  if (!raw) {
    return NextResponse.json({
      url: parsed.toString(), status: 402, ms, gated: true, challenge: null,
      note:
        "402 with no PAYMENT-REQUIRED header. The status says payment is needed and nothing states the terms, " +
        "so a caller has no way to construct one.",
      bodyPreview: bodyText.slice(0, 400),
    });
  }

  let decoded: { x402Version?: number; accepts?: Accept[]; error?: string } | null = null;
  let decodeError: string | null = null;
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    decodeError = "The header is present but is not base64-encoded JSON.";
  }

  const accepts = decoded?.accepts ?? [];
  // Resolved in parallel; a slow node must not hold up a decode that is already
  // complete without it.
  const resolved = await Promise.all(
    accepts.map((a) => (a.extra?.symbol ? Promise.resolve(null) : assetSymbol(a.network, a.asset))),
  );

  return NextResponse.json({
    url: parsed.toString(),
    status: 402,
    ms,
    gated: true,
    headerName: version === 2 ? "PAYMENT-REQUIRED" : "X-PAYMENT-REQUIRED",
    // The v1 header is a different NAME, not a different casing, so a server
    // that speaks only v1 is not a server with a typo.
    protocolVersion: decoded?.x402Version ?? (version === 1 ? 1 : null),
    headerBytes: raw.length,
    decodeError,
    challenge: decoded,
    ways: accepts.map((a, i) => {
      const chain = resolved[i];
      const decimals = a.extra?.decimals ?? chain?.decimals ?? 6;
      const base = a.maxAmountRequired ?? a.amount;
      const n = base === undefined || base === null ? null : Number(base);
      return {
        scheme: a.scheme ?? null,
        network: a.network ?? null,
        payTo: a.payTo ?? null,
        asset: a.asset ?? null,
        symbol: a.extra?.symbol ?? chain?.symbol ?? null,
        // So the page can say where a ticker the challenge did not state came from.
        symbolFromChain: !a.extra?.symbol && !!chain?.symbol,
        decimals,
        baseUnits: n,
        // Base units divided by the asset's decimals. Printing 10000 beside a
        // USDC sign would overstate the price a millionfold.
        amount: n === null || !Number.isFinite(n) ? null : n / 10 ** decimals,
        maxTimeoutSeconds: a.maxTimeoutSeconds ?? null,
        resource: a.resource ?? null,
        description: a.description ?? null,
      };
    }),
  });
}
