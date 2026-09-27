import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: API routes verify the signed session against the database.
export function proxy(req: NextRequest) {
  if (!req.cookies.get("td_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next|icons|sw\\.js|manifest\\.webmanifest|icon\\.png|favicon\\.ico|offline).*)"],
};
