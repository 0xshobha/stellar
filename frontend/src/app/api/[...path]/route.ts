import { NextRequest, NextResponse } from 'next/server';

/**
 * Primary: NEXT_PUBLIC_BACKEND_URL (set in Vercel to your deployed API origin, no trailing slash).
 * Optional server-only override: BACKEND_URL.
 */
function getBackendUrl(): string {
  const primary = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/$/, '');
  const fallback = process.env.BACKEND_URL?.trim().replace(/\/$/, '');
  if (primary) return primary;
  if (fallback) return fallback;
  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:4000';
  }
  throw new Error(
    'Missing NEXT_PUBLIC_BACKEND_URL (required in production for the API proxy). Set it in Vercel to your backend origin, e.g. https://your-api.onrender.com'
  );
}

function forwardRequestHeaders(request: NextRequest): Headers {
  const out = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === 'accept' ||
      k === 'authorization' ||
      k === 'content-type' ||
      k === 'cache-control' ||
      k === 'x-session-id' ||
      k === 'x-registry-agent' ||
      k === 'x-parent-agent' ||
      k === 'x-payment-proof' ||
      k.startsWith('x-payment') ||
      k.startsWith('payment-') ||
      k === 'payment-signature'
    ) {
      out.set(key, value);
    }
  });
  if (!out.has('Accept')) {
    out.set('Accept', '*/*');
  }
  return out;
}

function pickResponseHeaders(upstream: Response): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === 'content-type' ||
      k === 'cache-control' ||
      k === 'connection' ||
      k === 'x-accel-buffering' ||
      k.startsWith('x-payment') ||
      k.startsWith('payment')
    ) {
      nextHeaders[key] = value;
    }
  });
  return nextHeaders;
}

function resolveBackendPath(path: string[]): string {
  const direct = `/${path.join('/')}`;
  const first = path[0] ?? '';

  const shouldUseApiPrefix = new Set(['query', 'events', 'status', 'transactions', 'wallet', 'payments']);
  if (shouldUseApiPrefix.has(first)) {
    return `/api/${path.join('/')}`;
  }

  if (first === 'chain' && path[1] === 'config') {
    return `/api/${path.join('/')}`;
  }

  return direct;
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  try {
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
      headers: forwardRequestHeaders(request),
      body,
      cache: 'no-store'
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: pickResponseHeaders(upstream)
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'BACKEND_PROXY_ERROR',
          message: error instanceof Error ? error.message : 'Frontend proxy failed to reach backend',
          hint: 'In Vercel → Settings → Environment Variables, set NEXT_PUBLIC_BACKEND_URL to your backend base URL (no trailing slash), then redeploy.'
        }
      },
      { status: 500 }
    );
  }
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
