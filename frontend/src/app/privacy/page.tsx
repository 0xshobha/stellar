import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for the Stellar Net application.'
};

export default function PrivacyPage() {
  return (
    <main className="pb-10">
      <section className="panel">
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
        <div className="mt-4 space-y-4 text-sm text-slate-300">
          <p>
            Stellar Net stores session and transaction event data in memory for runtime visualization and operational
            diagnostics.
          </p>
          <p>
            API payloads submitted through the dashboard can include prompts and execution traces. Do not submit private,
            regulated, or sensitive information.
          </p>
          <p>
            Payment flows use on-chain x402 settlement when configured; session payment metadata and protocol traces may be
            recorded for diagnostics.
          </p>
          <p>
            This project does not provide production data retention guarantees. Restarting backend services may clear
            runtime state.
          </p>
          <p>
            Contact the repository maintainer for policy updates and production deployment guidance.
          </p>
        </div>
      </section>
    </main>
  );
}
