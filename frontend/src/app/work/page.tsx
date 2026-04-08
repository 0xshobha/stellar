import Link from 'next/link';

export default function WorkPage() {
  return (
    <main className="mx-auto max-w-7xl pb-10">
      <header className="playful-border subtle-grid mb-6 rounded-2xl border border-sky-100 bg-white/80 p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Work</h1>
        <p className="mt-1 text-sm text-slate-700">A simple walkthrough of how StellarSynergi works end-to-end.</p>
      </header>

      <section className="panel">
        <h2 className="text-lg font-semibold text-slate-900">Flow</h2>
        <div className="markdown mt-3">
          <ol>
            <li>
              <strong>User enters a query</strong> on the Dashboard.
            </li>
            <li>
              <strong>Manager plans steps</strong> and decides which agents to hire.
            </li>
            <li>
              <strong>Workers quote a price</strong> and the manager pays (mock or real x402).
            </li>
            <li>
              <strong>Recursive work</strong>: workers can hire sub-agents for sub-tasks.
            </li>
            <li>
              <strong>Settlement + logging</strong>: transactions and trace are recorded.
            </li>
            <li>
              <strong>Visualization</strong>: topology graph + protocol trace show the economy live.
            </li>
          </ol>

          <p>
            Open the{' '}
            <Link className="text-sky-700 underline decoration-sky-300" href="/dashboard">
              Dashboard
            </Link>{' '}
            to see the live topology and transaction log.
          </p>
        </div>
      </section>
    </main>
  );
}
