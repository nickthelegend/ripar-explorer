import type { Metadata } from "next";
import { Decoder } from "./decoder";

export const metadata: Metadata = {
  title: "Decode an x402 endpoint",
  description:
    "Point this at any paid HTTP endpoint and read back the terms it actually asks for: the price in base units and in the asset's own decimals, the scheme, the network, and the address the money would go to.",
  alternates: { canonical: "/decode" },
};

export const dynamic = "force-dynamic";

export default function DecodePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-[26px] font-semibold tracking-tight">Decode an x402 endpoint</h1>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        A paid endpoint states its price by refusing to answer: it returns <strong>402</strong> with a
        base64 header carrying every way it will accept payment. Paste any URL and this makes that
        request — no payment attached, which is exactly why the answer is a challenge — then decodes
        it field by field.
      </p>
      <p className="mt-2.5 max-w-[62ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        It works on endpoints that have nothing to do with Ripar. The price is shown twice, in base
        units and converted by the asset&rsquo;s decimals, because those differ by a factor of a
        million for USDC and only one of them is the number a human means.
      </p>

      <div className="mt-8">
        <Decoder />
      </div>
    </main>
  );
}
