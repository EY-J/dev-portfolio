import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateConversationToken() {
  return randomBytes(32).toString("base64url");
}

export function isConversationToken(token: string) {
  return TOKEN_PATTERN.test(token);
}

export function hashConversationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
