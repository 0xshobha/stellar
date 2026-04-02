import Link from "next/link";

import { listDocs } from "../../lib/docs";

export const metadata = {
  title: "Docs | SynergiStellar",
  description: "SynergiStellar documentation and project guides.",
};

export default async function DocsIndexPage() {
  const docs = await listDocs();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 md:px-8">
      <section className="panel p-6 md:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Documentation</h1>
        <p className="mt-2 text-sm text-slate-600">
          Product, architecture, and frontend design notes rendered directly from markdown files.
        </p>

        <ul className="mt-6 space-y-3">
          {docs.map((doc) => (
            <li key={doc.slug}>
              <Link
                href={`/docs/${doc.slug}`}
                className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
              >
                <span className="font-medium text-slate-900">{doc.title}</span>
                <span className="text-indigo-600 transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
