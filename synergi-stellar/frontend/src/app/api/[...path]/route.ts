import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const targetUrl = new URL(`${BACKEND_URL}/${path.join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const isBodyAllowed = !['GET', 'HEAD'].includes(request.method.toUpperCase());
  const body = isBodyAllowed ? await request.text() : undefined;

  const upstream = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: {
      'Content-Type': request.headers.get('content-type') ?? 'application/json'
    },
    body
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json'
    }
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
