import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// A quick redirect for people with no session cookie (spec 0004). Not a
// security boundary: every page and data function checks the session itself.

const PUBLIC = /^\/(login|setup|design|api|brand|result|school-logo)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/" || PUBLIC.test(pathname)) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Skip Next.js internals and files with an extension (icons, images).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
