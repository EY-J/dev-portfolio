import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const CMS_SESSION_COOKIE = "portfolio_cms_session";
export const CMS_SESSION_MAX_AGE_SECONDS = 60 * 60;
const CMS_SESSION_MAX_AGE_MS = CMS_SESSION_MAX_AGE_SECONDS * 1000;
const SESSION_VERSION = "v1";
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function signingKey(): Buffer {
  const encoded = process.env.CMS_SESSION_SECRET;
  if (!encoded || !/^[A-Za-z0-9_-]{43,}$/.test(encoded)) {
    throw new Error("CMS session secret is not configured.");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.length < 32 || key.toString("base64url") !== encoded) {
    throw new Error("CMS session secret is invalid.");
  }
  return key;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", signingKey()).update(payload).digest();
}

export function createCmsSessionValue(userId: string, issuedAt = Date.now()): string {
  if (!USER_ID_PATTERN.test(userId) || !Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    throw new Error("Invalid CMS session input.");
  }
  const payload = `${SESSION_VERSION}.${userId}.${issuedAt}`;
  return `${payload}.${signature(payload).toString("base64url")}`;
}

export function readCmsSessionUserId(value: string | null | undefined, now = Date.now()): string | null {
  if (!value || !Number.isSafeInteger(now)) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION || !USER_ID_PATTERN.test(parts[1])) return null;

  const issuedAt = Number(parts[2]);
  if (!/^\d{1,16}$/.test(parts[2]) || !Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt >= CMS_SESSION_MAX_AGE_MS) {
    return null;
  }

  try {
    const actual = Buffer.from(parts[3], "base64url");
    const expected = signature(`${parts[0]}.${parts[1]}.${parts[2]}`);
    return actual.length === expected.length && timingSafeEqual(actual, expected) ? parts[1] : null;
  } catch {
    return null;
  }
}

export function cmsSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/", // /admin/* and /authpreview are siblings.
    expires,
    maxAge: CMS_SESSION_MAX_AGE_SECONDS,
  };
}

export async function establishCmsSession(userId: string, now = Date.now()): Promise<void> {
  const value = createCmsSessionValue(userId, now);
  (await cookies()).set(CMS_SESSION_COOKIE, value, cmsSessionCookieOptions(new Date(now + CMS_SESSION_MAX_AGE_MS)));
}

export async function clearCmsSession(): Promise<void> {
  (await cookies()).set(CMS_SESSION_COOKIE, "", { ...cmsSessionCookieOptions(new Date(0)), maxAge: 0 });
}

export async function getCmsSessionUserId(now = Date.now()): Promise<string | null> {
  const value = (await cookies()).get(CMS_SESSION_COOKIE)?.value;
  return readCmsSessionUserId(value, now);
}
