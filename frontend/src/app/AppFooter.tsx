import Link from 'next/link';

const PRODUCT_LINKS = [
	{ label: 'Docs', href: '/docs' },
	{ label: 'API', href: '/api/docs/latest' },
	{ label: 'Privacy', href: '/privacy' },
	{ label: 'Terms', href: '/terms' }
];

const ECOSYSTEM_LINKS = [
	{ label: 'Stellar', href: 'https://stellar.org' },
	{ label: 'Soroban', href: 'https://soroban.stellar.org' },
	{ label: 'x402', href: 'https://www.ietf.org/archive/id/draft-ietf-httpbis-payments-00.html' }
];

const SOCIAL_LINKS = [
	{ label: 'GitHub', href: 'https://github.com' },
	{ label: 'X/Twitter', href: 'https://x.com' },
	{ label: 'Discord', href: 'https://discord.com' }
];

const STATUS_CHIPS = ['Stellar Testnet', 'Soroban Ready', 'Live Agent Economy'];

interface FooterLinkProps {
	href: string;
	label: string;
}

function ExternalFooterLink({ href, label }: FooterLinkProps) {
	return (
		<a
			className="soft-ring rounded-lg px-2 py-1 text-sm text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-700"
			href={href}
			target="_blank"
			rel="noreferrer"
		>
			{label}
		</a>
	);
}

function InternalFooterLink({ href, label }: FooterLinkProps) {
	return (
		<Link
			className="soft-ring rounded-lg px-2 py-1 text-sm text-slate-600 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-700"
			href={href}
		>
			{label}
		</Link>
	);
}

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="playful-border mt-10 rounded-2xl border border-sky-100 bg-white/90 shadow-sm backdrop-blur" aria-label="Site footer">
			<div className="px-5 py-8 sm:px-6">
				<div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
					<section aria-labelledby="footer-brand" className="space-y-3">
						<h2 id="footer-brand" className="text-base font-semibold tracking-wide text-slate-900">
							SynergiStellar
						</h2>
						<p className="max-w-xs text-sm leading-6 text-slate-600">
							x402 agent economy on Stellar, designed for transparent autonomous execution and payment-aware collaboration.
						</p>
					</section>

					<nav aria-labelledby="footer-product" className="space-y-3">
						<h3 id="footer-product" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
							Product
						</h3>
						<ul className="space-y-1">
							{PRODUCT_LINKS.map((item) => (
								<li key={item.label}>
									<InternalFooterLink href={item.href} label={item.label} />
								</li>
							))}
						</ul>
					</nav>

					<nav aria-labelledby="footer-ecosystem" className="space-y-3">
						<h3 id="footer-ecosystem" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
							Ecosystem
						</h3>
						<ul className="space-y-1">
							{ECOSYSTEM_LINKS.map((item) => (
								<li key={item.label}>
									<ExternalFooterLink href={item.href} label={item.label} />
								</li>
							))}
						</ul>
					</nav>

					<nav aria-labelledby="footer-social" className="space-y-3">
						<h3 id="footer-social" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
							Social
						</h3>
						<ul className="space-y-1">
							{SOCIAL_LINKS.map((item) => (
								<li key={item.label}>
									<ExternalFooterLink href={item.href} label={item.label} />
								</li>
							))}
						</ul>
					</nav>
				</div>

				<div className="mt-8 flex flex-wrap gap-2">
					{STATUS_CHIPS.map((chip) => (
						<span key={chip} className="glass-chip">
							{chip}
						</span>
					))}
				</div>

				<div className="mt-6 flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
					<p>Copyright {year} SynergiStellar</p>
					<p>Built for autonomous agent transactions</p>
				</div>
			</div>
		</footer>
	);
}
