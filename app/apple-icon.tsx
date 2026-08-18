import { ImageResponse } from "next/og";

/**
 * The touch icon iOS and Safari ask for by name.
 *
 * Without this the page declares only `rel="icon"`, and the browser falls back
 * to requesting /apple-touch-icon.png and /apple-touch-icon-precomposed.png by
 * convention. Both 404, and both are logged as console errors on every single
 * page load — two errors that had nothing to do with the page and could not be
 * found in the Performance API, because browser-initiated icon requests are not
 * recorded there.
 *
 * Declaring it makes Next emit `<link rel="apple-touch-icon">`, so the browser
 * asks for the thing that exists instead of guessing at two that do not.
 *
 * Drawn rather than shipped as a binary, so it stays byte-identical to the fan
 * in app/icon.svg — the mark is duplicated across five sites on purpose, and a
 * hand-exported PNG is exactly how it would drift.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BLADES = [
  { d: "M9.0 40.52 L42.5 35.03 L38.19 23.19 Z", from: "#ffd9a3", to: "#ff8f42" },
  { d: "M9.0 40.52 L39.46 20.51 L30.06 10.77 Z", from: "#ff9d4f", to: "#ff6620" },
  { d: "M9.0 40.52 L27.34 11.95 L16.81 7.48 Z", from: "#f4541b", to: "#c93400" },
  { d: "M9.0 40.52 L14.56 11.08 L5.5 10.77 Z", from: "#b62c00", to: "#8a2000" },
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#0c0c0e" }}>
        <svg viewBox="0 0 48 48" width={180} height={180}>
          <defs>
            {BLADES.map((b, i) => (
              <linearGradient key={i} id={`g${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={b.from} />
                <stop offset="1" stopColor={b.to} />
              </linearGradient>
            ))}
          </defs>
          {BLADES.map((b, i) => (
            <path key={i} d={b.d} fill={`url(#g${i})`} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
