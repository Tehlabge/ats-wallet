import { NextRequest, NextResponse } from 'next/server';

const BACKEND =
  process.env.NEXT_PUBLIC_API_BACKEND || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

async function proxy(request: NextRequest, path: string[]) {
  const pathPart = path.length ? path.join('/') : '';
  const search = request.nextUrl.search || '';
  const url = `${BACKEND}/admin/${pathPart}${search}`;

  const headers: Record<string, string> = {};
  const auth = request.headers.get('authorization');
  if (auth) headers['Authorization'] = auth;
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  let body: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      body = await request.text();
    } catch {
      body = undefined;
    }
  }

  try {
    const res = await fetch(url, {
      method: request.method,
      headers: Object.keys(headers).length ? headers : undefined,
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        {
          message: text || `Бэкенд вернул ${res.status}. Убедитесь, что бэкенд запущен (npm run start:dev в backend) и слушает порт 4000.`,
          statusCode: res.status,
        },
        { status: res.status }
      );
    }
    try {
      const data = text ? JSON.parse(text) : null;
      return NextResponse.json(data);
    } catch {
      return new NextResponse(text, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNetwork = /fetch|ECONNREFUSED|ENOTFOUND|network/i.test(msg);
    return NextResponse.json(
      {
        message: isNetwork
          ? 'Бэкенд недоступен. Запустите бэкенд: cd backend && npm run start:dev'
          : `Ошибка: ${msg}`,
      },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}
