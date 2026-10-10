import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { CMS_SESSION_COOKIE, cmsSessionCookieOptions, readCmsSessionUserId } from "@/features/cms/auth/cms-session";

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({ request });
          response.headers.set("Cache-Control", "private, no-store");

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headersToSet).forEach(([name, value]) =>
            response.headers.set(name, value)
          );
        },
      },
    }
  );

  // Supabase may refresh its own access token, but it never refreshes the
  // separate absolute CMS deadline.
  const authResult = await supabase.auth.getUser();
  const user = authResult?.data?.user ?? null;
  const cmsValue = request.cookies.getAll().find((cookie) => cookie.name === CMS_SESSION_COOKIE)?.value;
  const cmsUserId = readCmsSessionUserId(cmsValue);
  const validCmsIdentity = Boolean(cmsUserId && user && cmsUserId === user.id);
  if (!validCmsIdentity) {
    if (user) {
      try {
        await supabase.auth.signOut();
      } catch {
        // The CMS cookie is still revoked and the server guard still denies access.
      }
    }
    if (cmsValue) {
      request.cookies.set(CMS_SESSION_COOKIE, "");
      response.cookies.set(CMS_SESSION_COOKIE, "", { ...cmsSessionCookieOptions(new Date(0)), maxAge: 0 });
    }
  }

  const cacheControl = response.headers.get("Cache-Control");
  if (!cacheControl || !/\bprivate\b/i.test(cacheControl) || !/\bno-store\b/i.test(cacheControl)) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  if (request.nextUrl?.pathname === "/authpreview") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  if (!validCmsIdentity && request.nextUrl && request.nextUrl.pathname !== "/admin") {
    const loginResponse = NextResponse.redirect(new URL("/admin", request.url));
    response.cookies.getAll().forEach((cookie) => loginResponse.cookies.set(cookie));
    loginResponse.headers.set("Cache-Control", "private, no-store");
    loginResponse.headers.set("CDN-Cache-Control", "no-store");
    loginResponse.headers.set("Vercel-CDN-Cache-Control", "no-store");
    if (request.nextUrl.pathname === "/authpreview") {
      loginResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return loginResponse;
  }

  return response;
}
