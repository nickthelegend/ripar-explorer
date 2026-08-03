import { ImageResponse } from "next/og";
import { markDataUri } from "@/components/mark";
import { SITE_NAME } from "@/lib/site";

/**
 * One social card layout, filled in per route.
 *
 * Every OG image here is built from the record it describes — an agent card
 * carries that agent's real win count, a job card its real budget and stage.
 * The alternative is seven identical brand tiles, which tell a reader who
 * pasted a link nothing they did not already know from the URL.
 *
 * The brand fan is embedded as a data URI. The renderer has no network access,
 * so a remote image would silently render as nothing at all.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#171717";
const INK_2 = "#63615d";
const INK_3 = "#767370";
const LINE = "rgba(0,0,0,0.09)";
const ACCENT = "#ff6b2b";
const ACCENT_DEEP = "#c4400e";

export type OgFact = { label: string; value: string };

export function ogImage({
  eyebrow,
  title,
  subtitle,
  facts,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  facts: OgFact[];
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* The mark reads as the brand at thumbnail size; the wordmark carries
            it once the card is opened. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the OG
              renderer has no Next image pipeline; this is satori's <img>. */}
          <img src={markDataUri(52)} width={52} height={52} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 27, fontWeight: 700, color: INK, letterSpacing: -0.6 }}>{SITE_NAME}</span>
            <span style={{ fontSize: 17, color: INK_3 }}>explorer.ripar.io</span>
          </div>
          <div style={{ display: "flex", marginLeft: "auto" }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: ACCENT_DEEP,
                textTransform: "uppercase",
                letterSpacing: 1.4,
                border: `1px solid ${ACCENT}`,
                borderRadius: 8,
                padding: "7px 13px",
                background: "#fff6f1",
              }}
            >
              {eyebrow}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
          <span
            style={{
              fontSize: title.length > 62 ? 54 : 66,
              fontWeight: 700,
              color: INK,
              letterSpacing: -2,
              lineHeight: 1.08,
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: 26, color: INK_2, marginTop: 22, lineHeight: 1.4 }}>{subtitle}</span>
        </div>

        <div style={{ display: "flex", gap: 44, borderTop: `1px solid ${LINE}`, paddingTop: 26 }}>
          {facts.map((f) => (
            <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 15, color: INK_3, textTransform: "uppercase", letterSpacing: 1.1 }}>
                {f.label}
              </span>
              <span style={{ fontSize: 30, fontWeight: 600, color: INK, marginTop: 6 }}>{f.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", marginLeft: "auto", alignItems: "flex-end" }}>
            {/* Stated on every card. A social preview travels far away from the
                page that explains where these numbers came from. */}
            <span style={{ fontSize: 16, color: INK_3 }}>Sample capture — not live traffic</span>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
