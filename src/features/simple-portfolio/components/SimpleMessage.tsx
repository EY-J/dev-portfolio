"use client";

import type { ReactNode } from "react";

import MessageWidget from "@/features/messaging/components/MessageWidget";

export function SimpleMessageButton({ className, children }: { className: string; children: ReactNode }) {
  function openMessage() {
    const trigger = document.querySelector<HTMLButtonElement>(".simple-portfolio .message-widget-trigger");
    if (trigger?.getAttribute("aria-expanded") === "false") {
      trigger.click();
    } else {
      document.querySelector<HTMLInputElement>(".simple-portfolio .message-widget-form input[name='name']")?.focus();
    }
  }

  return <button className={className} onClick={openMessage} type="button">{children}</button>;
}

export function SimpleMessageWidget() {
  return <MessageWidget />;
}
