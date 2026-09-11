import type { MetadataRoute } from "next";

/**
 * The proxy serves other people's pages from this origin. Left crawlable, a search engine
 * indexes a copy of every site anyone has ever tested here, under this domain.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/preview", "/demo"] },
  };
}
