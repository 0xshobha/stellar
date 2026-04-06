import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import Navbar from '../components/Navbar';
import Footer from './AppFooter';
import FooterGate from './FooterGate';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'SynergiStellar',
    template: '%s | SynergiStellar'
  },
  description: 'Autonomous agent economy on Stellar with x402 micropayments, recursive hiring, live topology, and protocol traces.',
  keywords: [
    'Stellar',
    'x402',
    'agent economy',
    'autonomous agents',
    'Soroban',
    'USDC',
    'hackathon'
  ],
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'SynergiStellar',
    title: 'SynergiStellar — x402 Autonomous Agent Economy',
    description: 'Manager and worker agents execute paid tasks with x402 flow on Stellar.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'SynergiStellar Open Graph Image'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SynergiStellar — x402 Agent Economy',
    description: 'Recursive agent-to-agent payments and live protocol traces on Stellar.',
    images: ['/opengraph-image']
  },
  alternates: {
    canonical: '/'
  },
  icons: {
    icon: '/logo.svg'
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6">
          <Navbar />
          <div className="flex-1 pt-5">{children}</div>
          <FooterGate>
            <Footer />
          </FooterGate>
        </div>
      </body>
    </html>
  );
}
