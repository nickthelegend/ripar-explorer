import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://explorer.ripar.io/sitemap.xml",
    host: "https://explorer.ripar.io",
  };
}
