import Link from 'next/link';
import Typewriter from '../components/Typewriter';
import AgenticSphereBackground from '../components/AgenticSphereBackground';

export default function HomePage() {
  return (
    <main className="relative flex min-h-[calc(100vh-140px)] items-center justify-center overflow-hidden pb-0">
      <AgenticSphereBackground />

      <section className="relative z-10 w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="glass-chip">Welcome</span>
          <span className="glass-chip">Stellar Testnet</span>
          <span className="glass-chip">x402 Payments</span>
        </div>

        <h1 className="mt-5 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          <Typewriter className="text-slate-900" text="Welcome to StellarNet" />
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-slate-700 sm:text-base">
          A live dashboard for an autonomous agent economy: hiring, negotiation, and payments — visualized in real-time.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="soft-ring rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Open Dashboard
          </Link>
          <Link
            href="/about"
            className="soft-ring rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
          >
            About
          </Link>
          <Link
            href="/work"
            className="soft-ring rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
          >
            Work
          </Link>
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">Tip: Connect Freighter on the Dashboard to run sessions.</p>
      </section>
    </main>
  );
}
