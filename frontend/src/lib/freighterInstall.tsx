'use client';

/** Official Freighter distribution links (browser extensions). */
export const FREIGHTER_LINKS = {
  home: 'https://www.freighter.app/',
  chrome:
    'https://chromewebstore.google.com/detail/freighter/bcacmadeehkjemmemfbfbjfofgdaaebc',
  firefox: 'https://addons.mozilla.org/firefox/addon/freighter/'
} as const;

/** True when the page has the Freighter-injected bridge (extension installed and active). */
export function isFreighterInjectorPresent(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { freighterApi?: unknown; freighter?: unknown };
  return Boolean(w.freighterApi ?? w.freighter);
}

type CalloutProps = {
  className?: string;
  variant?: 'amber' | 'rose';
};

export function FreighterInstallCallout({ className = '', variant = 'amber' }: CalloutProps) {
  const border =
    variant === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900';
  const linkClass =
    variant === 'rose'
      ? 'rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100'
      : 'rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100';

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${border} ${className}`}>
      <p className="font-medium">Freighter extension not detected</p>
      <p className="mt-1 opacity-90">
        Install Freighter for Chrome or Firefox, refresh this page, then use <strong>Connect Freighter Wallet</strong>{' '}
        in the header.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className={linkClass} href={FREIGHTER_LINKS.chrome} target="_blank" rel="noopener noreferrer">
          Add to Chrome
        </a>
        <a className={linkClass} href={FREIGHTER_LINKS.firefox} target="_blank" rel="noopener noreferrer">
          Add to Firefox
        </a>
        <a className={linkClass} href={FREIGHTER_LINKS.home} target="_blank" rel="noopener noreferrer">
          Freighter.app
        </a>
      </div>
    </div>
  );
}
