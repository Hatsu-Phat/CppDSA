import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sid = req.cookies.get('sid')?.value;
  if (!sid) {
    return NextResponse.json({ user: null });
  }

  const apiInternalUrl = process.env.API_INTERNAL_URL || 'http://api:4000';
  try {
    const res = await fetch(`${apiInternalUrl}/api/auth/me`, {
      headers: {
        cookie: `sid=${sid}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    return NextResponse.json({ user: null });
  } catch {
    return NextResponse.json({ user: null });
  }
}
