import { promises as fs } from "node:fs";
import path from "node:path";

export type DocMeta = {
  slug: string;
  /** URL segments, e.g. ['core-concepts', 'agents'] */
  segments: string[];
  title: string;
};

export type NewestDocMeta = DocMeta & {
  updatedAt: string;
};

type DocMetaWithDate = DocMeta & {
  updatedAt: number;
};

const DOCS_DIR = path.resolve(process.cwd(), "..", "docs");

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9\-_]/g, "");
}

async function collectMarkdownFiles(
  dir: string,
  baseRel: string,
): Promise<Array<{ slug: string; segments: string[]; fullPath: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: Array<{ slug: string; segments: string[]; fullPath: string }> = [];

  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith(".")) continue;

    const rel = baseRel ? `${baseRel}/${name}` : name;

    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownFiles(path.join(dir, name), rel)));
    } else if (entry.isFile() && name.endsWith(".md")) {
      const slug = rel.slice(0, -3);
      const segments = slug.split("/").map(sanitizeSegment).filter(Boolean);
      if (segments.length === 0) continue;
      out.push({
        slug,
        segments,
        fullPath: path.join(dir, name),
      });
    }
  }

  return out;
}

function resolveDocPath(segments: string[]): string | null {
  const clean = segments.map(sanitizeSegment).filter(Boolean);
  if (clean.length === 0) return null;
  const filePath = path.resolve(DOCS_DIR, ...clean) + ".md";
  const rel = path.relative(path.resolve(DOCS_DIR), filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return filePath;
}

/** Preferred order for the docs index (learning path). Unlisted slugs sort alphabetically after. */
const DOC_NAV_ORDER: string[] = [
  "introduction",
  "quickstart",
  "core-concepts/agents",
  "core-concepts/manager",
  "core-concepts/payments",
  "core-concepts/recursion",
  "architecture/system-overview",
  "guides/create-agent",
  "guides/frontend-style",
  "demo/how-it-works",
];

function compareDocNav(a: DocMeta, b: DocMeta): number {
  const ia = DOC_NAV_ORDER.indexOf(a.slug);
  const ib = DOC_NAV_ORDER.indexOf(b.slug);
  if (ia === -1 && ib === -1) return a.slug.localeCompare(b.slug);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export async function listDocs(): Promise<DocMeta[]> {
  const files = await collectMarkdownFiles(DOCS_DIR, "");
  const docs: DocMeta[] = await Promise.all(
    files.map(async ({ slug, segments, fullPath }) => {
      const content = await fs.readFile(fullPath, "utf8");
      const title = titleFromMarkdown(content, slug);
      return { slug, segments, title };
    }),
  );

  return docs.sort(compareDocNav);
}

export async function listNewestDocs(limit = 3): Promise<NewestDocMeta[]> {
  const files = await collectMarkdownFiles(DOCS_DIR, "");
  const docs: DocMetaWithDate[] = await Promise.all(
    files.map(async ({ slug, segments, fullPath }) => {
      const [content, stat] = await Promise.all([fs.readFile(fullPath, "utf8"), fs.stat(fullPath)]);
      const title = titleFromMarkdown(content, slug);
      return { slug, segments, title, updatedAt: stat.mtimeMs };
    }),
  );

  return docs
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map(({ slug, segments, title, updatedAt }) => ({
      slug,
      segments,
      title,
      updatedAt: new Date(updatedAt).toISOString(),
    }));
}

export async function getDocBySlugSegments(
  segments: string[],
): Promise<{ title: string; content: string; slug: string } | null> {
  const clean = segments.map(sanitizeSegment).filter(Boolean);
  if (clean.length === 0) return null;

  const filePath = resolveDocPath(clean);
  if (!filePath) return null;

  try {
    const content = await fs.readFile(filePath, "utf8");
    const slug = clean.join("/");
    const title = titleFromMarkdown(content, slug);
    return { title, content, slug };
  } catch {
    return null;
  }
}
