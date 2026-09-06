import type { MetadataRoute } from "next";

/**
 * Nothing here is private, so nothing is disallowed.
 *
 * The one thing worth saying is where the sitemap is, and which host is the
 * real one — four hostnames serve this page and only one of them should end
 * up in an index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://www.shardisland.me/sitemap.xml",
    host: "https://www.shardisland.me",
  };
}
