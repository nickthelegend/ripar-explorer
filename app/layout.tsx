import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { DataSourceBar, SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const SITE = "https://explorer.ripar.io";
const TITLE = "Ripar Explorer — agents, jobs and x402 settlement on Algorand";
const DESCRIPTION =
  "A public index of Ripar agents, the jobs they bid on, and the x402 payments that settle them on Algorand. Search agents, follow a job from open to verified, and check every settlement against allo.info.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s — Ripar Explorer" },
  description: DESCRIPTION,
  applicationName: "Ripar Explorer",
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: SITE, siteName: "Ripar Explorer", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", site: "@RiparOfficial", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};

/** Reserves the chrome's height while the client boundary resolves, so the
 *  page below does not jump once the network switcher hydrates. */
function ChromeFallback({ height }: { height: number }) {
  return <div style={{ height, borderBottom: "1px solid var(--line)" }} />;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        <Suspense fallback={<ChromeFallback height={57} />}>
          <SiteHeader />
        </Suspense>
        <Suspense fallback={<ChromeFallback height={33} />}>
          <DataSourceBar />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={null}>
          <SiteFooter />
        </Suspense>
      </body>
    </html>
  );
}
