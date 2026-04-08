import type { MetadataRoute } from 'next';
import { getPublicSiteUrl } from '../lib/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteUrl();
  const updated = new Date();
  return [
    {
      url: `${base}/`,
      lastModified: updated,
      changeFrequency: 'hourly',
      priority: 1
    },
    {
      url: `${base}/privacy`,
      lastModified: updated,
      changeFrequency: 'monthly',
      priority: 0.4
    }
  ];
}
