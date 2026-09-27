"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { ADMIN_INBOX_TOPIC, CONVERSATION_UPDATED, INBOX_UPDATED, conversationRealtimeTopic, createRefreshScheduler, isRealtimeSignal } from "@/features/messaging/realtime/signals";

interface RealtimeRefreshProps {
  conversationTopicId?: string;
  adminInbox?: boolean;
}

export default function RealtimeRefresh({ conversationTopicId, adminInbox = false }: RealtimeRefreshProps) {
  const router = useRouter();
  const scheduler = useMemo(() => createRefreshScheduler(() => router.refresh()), [router]);
  const conversationTopic = conversationTopicId ? conversationRealtimeTopic(conversationTopicId) : null;

  useEffect(() => {
    if (!conversationTopic) return;
    const client = createClient();
    let active = true;
    const channel = client.channel(conversationTopic, { config: { private: false } });
    channel.on("broadcast", { event: CONVERSATION_UPDATED }, (message) => {
      if (active && isRealtimeSignal(message, CONVERSATION_UPDATED)) scheduler.schedule();
    });
    channel.subscribe((status) => {
      if (active && status === "SUBSCRIBED") scheduler.schedule();
    });
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [conversationTopic, scheduler]);

  useEffect(() => {
    if (!adminInbox) return;
    const client = createClient();
    let active = true;
    let remove: (() => void) | undefined;

    // Wait for the browser's Supabase session before joining the private topic.
    void (async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!active || !session) return;
        await client.realtime.setAuth();
        if (!active) return;
        const channel = client.channel(ADMIN_INBOX_TOPIC, { config: { private: true } });
        channel.on("broadcast", { event: INBOX_UPDATED }, (message) => {
          if (active && isRealtimeSignal(message, INBOX_UPDATED)) scheduler.schedule();
        });
        channel.subscribe((status) => {
          if (active && status === "SUBSCRIBED") scheduler.schedule();
        });
        remove = () => { void client.removeChannel(channel); };
      } catch {
        // A missed signal never blocks the authenticated HTTP inbox.
      }
    })();

    return () => {
      active = false;
      remove?.();
    };
  }, [adminInbox, scheduler]);

  useEffect(() => () => scheduler.cancel(), [scheduler]);

  return null;
}
