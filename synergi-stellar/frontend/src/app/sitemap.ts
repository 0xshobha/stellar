import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
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
