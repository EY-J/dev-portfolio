export const ADMIN_INBOX_TOPIC = "admin:messages";
export const CONVERSATION_UPDATED = "conversation_updated";
export const INBOX_UPDATED = "inbox_updated";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function conversationRealtimeTopic(topicId: string) {
  if (!UUID_PATTERN.test(topicId)) return null;
  return `conversation:${topicId.toLowerCase()}`;
}

export function isRealtimeSignal(message: unknown, expectedEvent: string) {
  if (typeof message !== "object" || message === null || !("event" in message) || !("payload" in message)) return false;
  const payload = message.payload;
  return message.event === expectedEvent && typeof payload === "object" && payload !== null
    && "type" in payload && payload.type === expectedEvent;
}

interface RefreshClock {
  now: () => number;
  set: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
}

const systemClock: RefreshClock = {
  now: () => Date.now(),
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer),
};

export function createRefreshScheduler(refresh: () => void, delayMs = 200, cooldownMs = 800, clock: RefreshClock = systemClock) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRefresh = -Infinity;

  return {
    schedule() {
      if (timer !== null) return;
      const wait = Math.max(delayMs, cooldownMs - (clock.now() - lastRefresh));
      timer = clock.set(() => {
        timer = null;
        lastRefresh = clock.now();
        refresh();
      }, wait);
    },
    cancel() {
      if (timer !== null) clock.clear(timer);
      timer = null;
    },
  };
}
