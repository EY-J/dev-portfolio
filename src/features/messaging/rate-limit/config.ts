import "server-only";

export const PUBLIC_RATE_LIMITS = {
  contact: {
    ip: { scope: "contact:ip", max: 5, windowSeconds: 3600 },
    email: { scope: "contact:email", max: 3, windowSeconds: 3600 },
  },
  recovery: {
    ip: { scope: "recovery:ip", max: 10, windowSeconds: 3600 },
    email: { scope: "recovery:email", max: 3, windowSeconds: 3600 },
  },
  visitorReply: {
    ip: { scope: "visitor-reply:ip", max: 60, windowSeconds: 3600 },
    conversation: { scope: "visitor-reply:conversation", max: 20, windowSeconds: 600 },
  },
} as const;

export type RateLimitScope =
  | "contact:ip" | "contact:email"
  | "recovery:ip" | "recovery:email"
  | "visitor-reply:ip" | "visitor-reply:conversation";

export interface RateLimitRule {
  readonly scope: RateLimitScope;
  readonly max: number;
  readonly windowSeconds: number;
}
