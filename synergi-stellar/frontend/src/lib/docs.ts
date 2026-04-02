import { promises as fs } from "node:fs";
import path from "node:path";

export type DocMeta = {
  slug: string;
  title: string;
};

export type NewestDocMeta = DocMeta & {
  updatedAt: string;
};

type DocMetaWithDate = DocMeta & {
  updatedAt: number;
};

const DOCS_DIR = path.join(process.cwd(), "..", "docs");

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

export async function listDocs(): Promise<DocMeta[]> {
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });

  const docs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const slug = entry.name.replace(/\.md$/, "");
        const fullPath = path.join(DOCS_DIR, entry.name);
        const content = await fs.readFile(fullPath, "utf8");
        const title = titleFromMarkdown(content, slug);

        return { slug, title };
      }),
  );

  return docs.sort((a, b) => a.title.localeCompare(b.title));
}

export async function listNewestDocs(limit = 3): Promise<NewestDocMeta[]> {
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });

  const docs: DocMetaWithDate[] = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const slug = entry.name.replace(/\.md$/, "");
        const fullPath = path.join(DOCS_DIR, entry.name);
        const [content, stat] = await Promise.all([fs.readFile(fullPath, "utf8"), fs.stat(fullPath)]);
        const title = titleFromMarkdown(content, slug);

        return { slug, title, updatedAt: stat.mtimeMs };
      }),
  );

  return docs
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ slug, title, updatedAt }) => ({ slug, title, updatedAt: new Date(updatedAt).toISOString() }));
}

export async function getDocBySlug(slug: string): Promise<{ title: string; content: string } | null> {
  const safeSlug = slug.replace(/[^a-zA-Z0-9\-_]/g, "");
  if (!safeSlug) return null;

  const fullPath = path.join(DOCS_DIR, `${safeSlug}.md`);

  try {
    const content = await fs.readFile(fullPath, "utf8");
    const title = titleFromMarkdown(content, safeSlug);
    return { title, content };
  } catch {
    return null;
  }
}
