import type { MetadataRoute } from 'next';
import { getPublicSiteUrl } from '../lib/siteUrl';

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/']
    },
    sitemap: `${base}/sitemap.xml`
  };
}
