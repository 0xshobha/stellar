import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';
import Logo from '../components/Logo';
import Footer from './AppFooter';

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
          <header className="sticky top-0 z-20 mt-3 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <Link className="group flex items-center gap-3" href="/">
                <Logo className="float-soft h-9 w-9 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105" />
                <div className="leading-tight">
                  <span className="block text-sm font-semibold tracking-wide text-slate-800">SynergiStellar</span>
                  <span className="block text-xs text-slate-500">x402 agent economy demo</span>
                </div>
              </Link>

              <div className="hidden items-center gap-2 md:flex">
                <span className="glass-chip">Stellar Testnet</span>
                <span className="glass-chip">Soroban Ready</span>
              </div>

              <nav className="flex items-center gap-3 text-sm">
                <Link className="soft-ring group relative overflow-hidden rounded-xl border border-transparent bg-slate-50 px-4 py-2 font-medium text-slate-600 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:text-sky-700 hover:shadow-md" href="/docs">
                  <span className="relative z-10">Docs</span>
                  <div className="absolute inset-0 z-0 h-full w-full bg-gradient-to-r from-sky-50 to-indigo-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Link>
                <Link className="soft-ring group relative overflow-hidden rounded-xl border border-transparent bg-slate-50 px-4 py-2 font-medium text-slate-600 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:bg-white hover:text-sky-700 hover:shadow-md" href="/privacy">
                  <span className="relative z-10">Privacy</span>
                  <div className="absolute inset-0 z-0 h-full w-full bg-gradient-to-r from-sky-50 to-indigo-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Link>
              </nav>
            </div>
          </header>
          <div className="flex-1 pt-5">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
