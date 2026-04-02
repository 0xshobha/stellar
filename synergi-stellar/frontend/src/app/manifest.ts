import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SynergiStellar',
    short_name: 'Synergi',
    description: 'Autonomous x402 agent economy dashboard on Stellar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml'
      }
    ]
  };
}
