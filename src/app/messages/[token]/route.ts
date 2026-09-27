import { NextResponse, type NextRequest } from "next/server";

import { getConversationByPublicToken } from "@/features/messaging/service";
import { VISITOR_MESSAGE_SESSION_COOKIE, visitorMessageCookieOptions } from "@/features/messaging/session/cookie";
import { authorizeConversationForVisitorSession } from "@/features/messaging/session/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let destination = "/messages/unavailable";
  let browserSession: Awaited<ReturnType<typeof authorizeConversationForVisitorSession>> | null = null;

  try {
    const conversation = await getConversationByPublicToken(token);
    if (conversation) {
      browserSession = await authorizeConversationForVisitorSession(
        conversation.id,
        request.cookies.get(VISITOR_MESSAGE_SESSION_COOKIE)?.value ?? null,
      );
      destination = "/messages";
    }
  } catch {
    // Invalid access and infrastructure failures expose no private details.
  }

  const response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (browserSession) {
    response.cookies.set(VISITOR_MESSAGE_SESSION_COOKIE, browserSession.token, visitorMessageCookieOptions(browserSession.expiresAt));
  }
  return response;
}
