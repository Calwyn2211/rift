import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();

  if (body.password === process.env.AUTH_PASSWORD) {
    const response = NextResponse.json({ success: true });
    
    // Set a cookie that lasts 30 days
    response.cookies.set('rift_auth', 'true', {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 Days
    });

    return response;
  }

  return NextResponse.json({ success: false }, { status: 401 });
}