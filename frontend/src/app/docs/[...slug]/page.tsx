import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getDocBySlugSegments, listDocs } from "../../../lib/docs";

type Props = {
  params: {
    slug: string[];
  };
};

export async function generateStaticParams() {
  const docs = await listDocs();
  return docs.map((doc) => ({ slug: doc.segments }));
}

export default async function DocPage({ params }: Props) {
  const segments = params.slug ?? [];
  const doc = await getDocBySlugSegments(segments);
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 md:px-8">
      <section className="panel p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{doc.title}</h1>
          <Link
            href="/docs"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
          >
            All docs
          </Link>
        </div>

        <article className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
        </article>
      </section>
    </main>
  );
}
