import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // ── Onboarding gate ─────────────────────────────────────────────────────
    // If the user hasn't completed their org profile, redirect to /onboarding.
    // Allow /onboarding itself and all API routes to pass through.
    if (
      token &&
      !token.profileComplete &&
      token.role !== "SUPER_ADMIN" &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api/")
    ) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // ── SUPER_ADMIN only areas ───────────────────────────────────────────────
    if (
      pathname.startsWith("/admin") &&
      token?.role !== "SUPER_ADMIN"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // ── Builder requires DEPT_ADMIN or SUPER_ADMIN ───────────────────────────
    if (
      pathname.startsWith("/builder") &&
      token?.role === "USER"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ token }) {
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except login, api/auth, and static files.
    // `favicon.svg` and `logos` must be excluded: they are public assets shown
    // ON the login page, so redirecting them to /login means the logged-out user
    // — the only one who sees that page — gets nothing. `logos` is listed even
    // though no branding ships today, so re-adding some can't silently
    // reintroduce this. next/image fetches the
    // source over HTTP internally, so a redirect here surfaces as the opaque
    // "The requested resource isn't a valid image" 400 from the optimizer.
    // `api/sso` must be public: it runs BEFORE the user has a session, and it
    // authenticates by IIS's secret header rather than by cookie.
    "/((?!login|api/auth|api/sso|_next/static|_next/image|favicon.ico|favicon.svg|fonts|logos).*)",
  ],
};
