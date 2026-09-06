import type { MetadataRoute } from "next";

/**
 * One page, because there is one page.
 *
 * A sitemap for a single URL earns its keep only by naming the canonical
 * host: it is the plainest statement available that the other three
 * spellings are the same thing wearing a different hat.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.shardislands.me",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
