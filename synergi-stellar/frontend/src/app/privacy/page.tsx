import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for the SynergiStellar demo application.'
};

export default function PrivacyPage() {
  return (
    <main className="pb-10">
      <section className="panel">
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
        <div className="mt-4 space-y-4 text-sm text-slate-300">
          <p>
            SynergiStellar is a hackathon demo. The application stores session and transaction event data in memory for
            runtime visualization and debugging.
          </p>
          <p>
            API payloads submitted through the dashboard can include prompts and execution traces. Do not submit private,
            regulated, or sensitive information.
          </p>
          <p>
            Wallet and payment values displayed by this demo may be simulated depending on configuration. In strict x402
            mode, payment metadata and protocol traces are recorded for session diagnostics.
          </p>
          <p>
            This project does not provide production data retention guarantees. Restarting backend services may clear
            runtime state.
          </p>
          <p>
            Contact the repository maintainer for policy updates when deploying outside local development or testnet
            environments.
          </p>
        </div>
      </section>
    </main>
  );
}
