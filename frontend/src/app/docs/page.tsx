import Link from "next/link";

import { listDocs, type DocMeta } from "../../lib/docs";

export const metadata = {
  title: "Docs | SynergiStellar",
  description: "SynergiStellar: agent economies, x402 payments on Stellar, and Soroban registry.",
};

const SECTIONS: { title: string; description: string; match: (slug: string) => boolean }[] = [
  {
    title: "Start here",
    description: "Framing, setup, first query.",
    match: (s) => s === "introduction" || s === "quickstart",
  },
  {
    title: "Core concepts",
    description: "Agents, manager, payments, recursion.",
    match: (s) => s.startsWith("core-concepts/"),
  },
  {
    title: "Architecture",
    description: "End-to-end system map.",
    match: (s) => s.startsWith("architecture/"),
  },
  {
    title: "Guides",
    description: "Extend workers and UI.",
    match: (s) => s.startsWith("guides/"),
  },
  {
    title: "Demo",
    description: "Judge flow and checklist.",
    match: (s) => s.startsWith("demo/"),
  },
];

function sectionForSlug(slug: string): (typeof SECTIONS)[number] | null {
  return SECTIONS.find((sec) => sec.match(slug)) ?? null;
}

function groupDocs(docs: DocMeta[]): Map<string, DocMeta[]> {
  const map = new Map<string, DocMeta[]>();
  for (const doc of docs) {
    const sec = sectionForSlug(doc.slug);
    const key = sec?.title ?? "More";
    const list = map.get(key) ?? [];
    list.push(doc);
    map.set(key, list);
  }
  return map;
}

export default async function DocsIndexPage() {
  const docs = await listDocs();
  const grouped = groupDocs(docs);
  const order = [...SECTIONS.map((s) => s.title), "More"];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 md:px-8">
      <section className="panel p-6 md:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Documentation</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
          SynergiStellar documents a <strong>new runtime shape</strong>: autonomous agents discovering, hiring, and paying
          each other with <strong>x402</strong> on Stellar. Read in order for the shortest path from idea to working demo.
        </p>

        <div className="mt-8 grid gap-8">
          {order.map((sectionTitle) => {
            const items = grouped.get(sectionTitle);
            if (!items?.length) return null;
            const sectionMeta = SECTIONS.find((s) => s.title === sectionTitle);

            return (
              <div key={sectionTitle}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{sectionTitle}</h2>
                {sectionMeta ? (
                  <p className="mt-1 text-sm text-slate-600">{sectionMeta.description}</p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {items.map((doc) => (
                    <li key={doc.slug}>
                      <Link
                        href={`/docs/${doc.slug}`}
                        className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
                      >
                        <span className="font-medium text-slate-900">{doc.title}</span>
                        <span className="text-indigo-600 transition-transform duration-200 group-hover:translate-x-1">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
