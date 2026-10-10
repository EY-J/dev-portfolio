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

export async function claimInquirySubmissionKey(key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error("inquiry_submission_key_invalid");
  }
  const rule = PUBLIC_RATE_LIMITS.inquirySubmission;
  // The deployed RPC accepts the existing contact scopes. Prefixing the
  // identifier keeps this bucket separate from normalized email buckets.
  return consume(rule, createRateLimitKey(rule.scope, `submission:${key.toLowerCase()}`));
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
