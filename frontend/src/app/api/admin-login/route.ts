import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_BACKEND || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const res = await fetch(`${BACKEND}/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      if (text) data = JSON.parse(text);
    } catch {
      // not JSON
    }

    if (!res.ok) {
      return NextResponse.json(
        { message: data.message || data.error || 'Неверный логин или пароль' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ошибка входа';
    return NextResponse.json({ message }, { status: 500 });
  }
}
