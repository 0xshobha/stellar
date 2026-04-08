/**
 * Public site origin for metadata, sitemap, and robots.
 * Prefer explicit env; on Vercel use VERCEL_URL when NEXT_PUBLIC_SITE_URL is unset.
 */
export function getPublicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/$/, '')}`;
  }
  return 'http://localhost:3000';
}
