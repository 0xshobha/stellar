import Link from 'next/link';
import TransactionsFeed from '../../components/TransactionsFeed';
import WalletConnectCard from '../../components/WalletConnectCard';

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-7xl pb-10">
      <header className="playful-border subtle-grid mb-6 rounded-2xl border border-sky-100 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">About</h1>
        <p className="mt-1 text-sm text-slate-700">
          This page explains the project and shows the live building blocks: wallet connection and transactions.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WalletConnectCard />

        <section className="panel">
          <h2 className="text-lg font-semibold text-slate-900">What this project does</h2>
          <div className="markdown mt-3">
            <ul>
              <li>Manager agent breaks your query into tasks.</li>
              <li>Worker agents (Price, News, Sentiment, Research, Math, Summarizer) get hired.</li>
              <li>x402 rules decide whether a request needs payment (HTTP 402 flow).</li>
              <li>Transfers settle on Stellar via x402 and the configured facilitator.</li>
              <li>Frontend visualizes the live topology + protocol trace + transactions.</li>
            </ul>
            <p>
              For the live operations view, open the{' '}
              <Link className="text-sky-700 underline decoration-sky-300" href="/dashboard">
                Dashboard
              </Link>
              .
            </p>
          </div>
        </section>
      </div>

      <div className="mt-4">
        <TransactionsFeed />
      </div>
    </main>
  );
}
