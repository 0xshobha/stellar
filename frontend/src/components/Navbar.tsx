'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

type NavItem = {
  href: string;
  label: string;
  match?: 'exact' | 'prefix';
};

const navItems: NavItem[] = [
  { href: '/', label: 'Home', match: 'exact' },
  { href: '/dashboard', label: 'Dashboard', match: 'prefix' },
  { href: '/about', label: 'About', match: 'prefix' },
  { href: '/work', label: 'Work', match: 'prefix' },
  { href: '/docs', label: 'Docs', match: 'prefix' },
  { href: '/privacy', label: 'Privacy', match: 'prefix' }
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'exact') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 mt-3 rounded-2xl border border-sky-100 bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <Link className="group flex items-center gap-3" href="/">
          <Logo className="float-soft h-9 w-9 transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105" />
          <div className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide text-slate-800">Stellar Net</span>
            <span className="block text-xs text-slate-500">x402 agent economy platform</span>
          </div>
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="glass-chip">Stellar Testnet</span>
          <span className="glass-chip">Soroban Ready</span>
        </div>

        <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {navItems.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'soft-ring group relative overflow-hidden rounded-xl border px-3 py-2 font-medium shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ' +
                  (active
                    ? 'border-sky-200 bg-white text-sky-700'
                    : 'border-transparent bg-slate-50 text-slate-600 hover:border-sky-200 hover:bg-white hover:text-sky-700')
                }
                aria-current={active ? 'page' : undefined}
              >
                <span className="relative z-10">{item.label}</span>
                <div className="absolute inset-0 z-0 h-full w-full bg-gradient-to-r from-sky-50 to-indigo-50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
