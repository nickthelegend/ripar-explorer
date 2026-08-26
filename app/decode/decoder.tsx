"use client";

import { useState } from "react";
import { Panel } from "@/components/ui";

/**
 * Point this at a paid endpoint and read back what it is actually asking for.
 *
 * Every number shown here came out of a challenge the endpoint returned during
 * this request. Nothing is remembered between runs and nothing is filled in from
 * a default: an endpoint that names no price shows no price, because that is a
 * real and useful thing to learn about it.
 */

type Way = {
  scheme: string | null; network: string | null; payTo: string | null; asset: string | null;
  symbol: string | null; decimals: number; baseUnits: number | null; amount: number | null;
  maxTimeoutSeconds: number | null; resource: string | null; description: string | null;
  symbolFromChain?: boolean;
};
type Result = {
  url: string; status: number; ms: number; gated: boolean;
  headerName?: string; protocolVersion?: number | null; headerBytes?: number;
  decodeError?: string | null; challenge?: unknown; ways?: Way[];
  note?: string; bodyPreview?: string; error?: string;
};

const EXAMPLE = "https://api.ripar.io/api/summarize";

export function Decoder() {
  const [url, setUrl] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decode(target: string) {
    if (busy) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/decode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const j = (await r.json()) as Result;
      if (!r.ok) setErr(j.error ?? `The decoder answered ${r.status}.`);
      else setRes(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => { e.preventDefault(); decode(url); }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          aria-label="Endpoint URL to decode"
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-[13px]"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
          // --brand was never defined in globals.css, so this resolved to
          // transparent: white text on a white page, an invisible button that
          // only Enter could submit. --accent-deep carries 5.07:1 against white,
          // where --accent (#ff6b2b) is 2.86:1 and fails AA at this 13px size.
          style={{ background: "var(--accent-deep)" }}
        >
          {busy ? "Asking…" : "Decode"}
        </button>
      </form>

      {err && (
        <Panel title="Could not ask">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>{err}</p>
        </Panel>
      )}

      {res && (
        <div className="space-y-4">
          <Panel title={`${res.status} · ${res.ms}ms`}>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {res.gated ? (
                <>
                  <span className="font-mono">{res.url}</span> is x402-gated. It answered{" "}
                  <strong>402</strong> in {res.ms}ms and stated its terms in a{" "}
                  <span className="font-mono">{res.headerName}</span> header of {res.headerBytes} bytes
                  {res.protocolVersion ? <> declaring x402 version {res.protocolVersion}</> : null}.
                </>
              ) : (
                res.note
              )}
            </p>
            {res.decodeError && (
              <p className="mt-2 text-[13px]" style={{ color: "var(--bad)" }}>{res.decodeError}</p>
            )}
          </Panel>

          {(res.ways ?? []).map((w, i) => (
            <Panel key={i} title={`Way ${i + 1} to pay`}>
              <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                <Row k="Price">
                  {w.amount === null ? (
                    <span style={{ color: "var(--ink-3)" }}>the challenge named no amount</span>
                  ) : (
                    <>
                      {w.amount} {w.symbol ?? "units"}
                      <span className="ml-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        ({w.baseUnits} base units ÷ 10^{w.decimals})
                      </span>
                      {w.symbolFromChain && (
                        <span className="ml-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                          · ticker read from the asset, which the challenge did not state
                        </span>
                      )}
                    </>
                  )}
                </Row>
                <Row k="Scheme">{w.scheme ?? "—"}</Row>
                <Row k="Network">
                  <span className="font-mono text-[12px]">{w.network ?? "—"}</span>
                </Row>
                <Row k="Asset">{w.asset ?? "—"}</Row>
                <Row k="Pays to">
                  <span className="font-mono text-[12px] break-all">{w.payTo ?? "—"}</span>
                </Row>
                <Row k="Must settle within">
                  {w.maxTimeoutSeconds === null ? "—" : `${w.maxTimeoutSeconds}s`}
                </Row>
              </dl>
              {w.description && (
                <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {w.description}
                </p>
              )}
            </Panel>
          ))}

          {res.challenge != null && (
            <Panel title="The challenge, decoded">
              <pre
                className="overflow-x-auto rounded-lg p-3 font-mono text-[12px] leading-relaxed"
                style={{ background: "var(--panel-2, var(--panel))", color: "var(--ink-2)" }}
              >
                {JSON.stringify(res.challenge, null, 2)}
              </pre>
              <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
                This is the base64 header decoded, unchanged. Nothing above is computed from
                anywhere else — every field on this page is read out of exactly this object.
              </p>
            </Panel>
          )}

          {res.bodyPreview && (
            <Panel title="What it said in the body">
              <pre className="overflow-x-auto font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
                {res.bodyPreview}
              </pre>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>{k}</dt>
      <dd className="mt-0.5 text-[13.5px]" style={{ color: "var(--ink-1, var(--ink-2))" }}>{children}</dd>
    </div>
  );
}
