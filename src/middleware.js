import { NextResponse } from 'next/server';

export function middleware(request) {
  const authCookie = request.cookies.get('rift_auth');
  const { pathname } = request.nextUrl;

  // If user is already on login page, let them pass
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // If user has no cookie, kick them to /login
  if (!authCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

// Only protect these routes (don't block images/css)
export const config = {
  matcher: ['/', '/api/check-orders'],
};