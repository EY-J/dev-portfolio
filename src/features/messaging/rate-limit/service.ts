import "server-only";

import { PUBLIC_RATE_LIMITS, type RateLimitRule } from "@/features/messaging/rate-limit/config";
import { createRateLimitKey, requestIpRateLimitKey } from "@/features/messaging/rate-limit/identity";
import { validateRecoveryEmail } from "@/features/messaging/validation";
import { createAdminClient } from "@/lib/supabase/admin";

async function consume(rule: RateLimitRule, keyHash: string) {
  const { data, error } = await createAdminClient().rpc("consume_portfolio_rate_limit", {
    p_scope: rule.scope,
    p_key_hash: keyHash,
    p_limit: rule.max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error || !Array.isArray(data) || data.length !== 1 || typeof data[0]?.allowed !== "boolean") {
    throw new Error("rate_limit_unavailable");
  }
  return data[0].allowed;
}

async function checkEmailAndIp(email: string, rules: { ip: RateLimitRule; email: RateLimitRule }) {
  const normalized = validateRecoveryEmail(email);
  if (!normalized) throw new Error("rate_limit_invalid_email");
  if (!(await consume(rules.ip, await requestIpRateLimitKey(rules.ip.scope)))) return false;
  return consume(rules.email, createRateLimitKey(rules.email.scope, normalized));
}

export async function checkContactRateLimit(email: string) {
  return checkEmailAndIp(email, PUBLIC_RATE_LIMITS.contact);
}

export async function checkRecoveryRateLimit(email: string) {
  return checkEmailAndIp(email, PUBLIC_RATE_LIMITS.recovery);
}

export async function checkVisitorReplyIpRateLimit() {
  const rule = PUBLIC_RATE_LIMITS.visitorReply.ip;
  return consume(rule, await requestIpRateLimitKey(rule.scope));
}

export async function checkVisitorConversationRateLimit(conversationId: string) {
  const rule = PUBLIC_RATE_LIMITS.visitorReply.conversation;
  return consume(rule, createRateLimitKey(rule.scope, conversationId));
}
