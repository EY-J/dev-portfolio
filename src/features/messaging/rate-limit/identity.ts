import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

import type { RateLimitScope } from "@/features/messaging/rate-limit/config";

export type ProxyMode = "none" | "vercel" | "cloudflare";

function secretBytes() {
  const value = process.env.RATE_LIMIT_SECRET;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("rate_limit_secret_missing_or_invalid");
  return Buffer.from(value, "hex");
}

export function createRateLimitKey(scope: RateLimitScope, normalizedIdentifier: string) {
  if (!normalizedIdentifier) throw new Error("rate_limit_identifier_missing");
  return createHmac("sha256", secretBytes()).update(`${scope}:${normalizedIdentifier}`).digest("hex");
}

export function proxyMode(): ProxyMode {
  const configured = process.env.RATE_LIMIT_PROXY_MODE;
  const mode = configured === undefined || configured === ""
    ? (process.env.VERCEL === "1" ? "vercel" : "none")
    : configured;
  if (mode === "none" && process.env.NODE_ENV === "production") {
    throw new Error("rate_limit_proxy_mode_required");
  }
  if (mode === "none" || mode === "vercel" || mode === "cloudflare") return mode;
  throw new Error("rate_limit_proxy_mode_invalid");
}

function validAddress(value: string | null, firstInChain: boolean) {
  if (!value) return null;
  const candidate = (firstInChain ? value.split(",", 1)[0] : value).trim();
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function createIpRateLimitKey(scope: RateLimitScope, requestHeaders: Pick<Headers, "get">, mode: ProxyMode) {
  const address = mode === "vercel"
    ? validAddress(requestHeaders.get("x-vercel-forwarded-for"), true)
    : mode === "cloudflare"
      ? validAddress(requestHeaders.get("cf-connecting-ip"), false)
      : null;
  if (!address && process.env.NODE_ENV === "production") {
    throw new Error("rate_limit_trusted_ip_unavailable");
  }
  return createRateLimitKey(scope, address ?? "unknown");
}

export async function requestIpRateLimitKey(scope: RateLimitScope) {
  return createIpRateLimitKey(scope, await headers(), proxyMode());
}
