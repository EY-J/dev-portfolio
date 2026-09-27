import "server-only";

import { cookies } from "next/headers";

export const VISITOR_MESSAGE_SESSION_COOKIE = "portfolio_message_session";
export const VISITOR_MESSAGE_SESSION_DAYS = 30;

export function visitorMessageCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/messages",
    expires,
  };
}

export async function readVisitorMessageSessionCookie() {
  return (await cookies()).get(VISITOR_MESSAGE_SESSION_COOKIE)?.value ?? null;
}

export async function clearVisitorMessageSessionCookie() {
  (await cookies()).set(VISITOR_MESSAGE_SESSION_COOKIE, "", {
    ...visitorMessageCookieOptions(new Date(0)),
    maxAge: 0,
  });
}
