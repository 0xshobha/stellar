import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const configured = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:4000';
  throw new Error('Missing BACKEND_URL (or NEXT_PUBLIC_BACKEND_URL) for frontend API proxy in production');
}

function pickHeaders(headers: Headers): Record<string, string> {
  const allowed = ['content-type', 'cache-control', 'connection', 'x-payment-enforced', 'x-payment-required'];
  const nextHeaders: Record<string, string> = {};
  for (const name of allowed) {
    const value = headers.get(name);
    if (value) nextHeaders[name] = value;
  }
  return nextHeaders;
}

function resolveBackendPath(path: string[]): string {
  const direct = `/${path.join('/')}`;
  const first = path[0] ?? '';

  const shouldUseApiPrefix = new Set(['query', 'events', 'status', 'transactions', 'wallet']);
  if (shouldUseApiPrefix.has(first)) {
    return `/api/${path.join('/')}`;
  }

  if (first === 'chain' && path[1] === 'config') {
    return `/api/${path.join('/')}`;
  }

  return direct;
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const BACKEND_URL = getBackendUrl();
  const targetPath = resolveBackendPath(path);
  const targetUrl = new URL(`${BACKEND_URL}${targetPath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const isBodyAllowed = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const body = isBodyAllowed ? await request.text() : undefined;

  const upstream = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json',
      Accept: request.headers.get('accept') ?? '*/*'
    },
    body
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: pickHeaders(upstream.headers)
  });
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context.params.path);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context.params.path);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }) {
  return proxy(request, context.params.path);
}
