"use client";

import { ArrowUpRight, MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { submitInquiry, type InquiryActionState } from "@/features/messaging/actions";

const initialState: InquiryActionState = { status: "idle", error: null };
type WidgetView = "closed" | "form";

export default function MessageWidget({ openRequest = 0 }: { openRequest?: number }) {
  const [view, setView] = useState<WidgetView>("closed");
  const [invitationVisible, setInvitationVisible] = useState(true);
  const [submissionKey, setSubmissionKey] = useState("");
  const submissionLocked = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: InquiryActionState, data: FormData): Promise<InquiryActionState> => {
    if (data.get("__reset") === "1") return initialState;
    try {
      return await submitInquiry(previous, data);
    } catch {
      return { status: "error", error: "Unable to send your inquiry right now. Please try again later." };
    } finally {
      submissionLocked.current = false;
      setSubmissionKey(crypto.randomUUID());
    }
  }, initialState);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const lastOpenRequest = useRef(openRequest);
  const invitationTimer = useRef<number | null>(null);
  const showingSuccess = view === "form" && (state.status === "success" || state.status === "sent_without_session");

  useEffect(() => {
    invitationTimer.current = window.setTimeout(() => setInvitationVisible(false), 5000);
    return () => { if (invitationTimer.current !== null) window.clearTimeout(invitationTimer.current); };
  }, []);

  function showInvitation() {
    if (invitationTimer.current !== null) window.clearTimeout(invitationTimer.current);
    setInvitationVisible(true);
    invitationTimer.current = window.setTimeout(() => setInvitationVisible(false), 5000);
  }

  useEffect(() => {
    if (openRequest !== lastOpenRequest.current) {
      lastOpenRequest.current = openRequest;
      setView("form");
    }
  }, [openRequest, state.status]);

  useEffect(() => {
    if (showingSuccess) successRef.current?.focus();
    else if (view === "form") firstInputRef.current?.focus();
  }, [view, showingSuccess]);

  useEffect(() => {
    if (view === "closed") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setView("closed");
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, pending]);

  function openPanel() {
    if (!submissionKey) setSubmissionKey(crypto.randomUUID());
    setView("form");
    setInvitationVisible(false);
  }

  function closePanel() {
    if (pending) return;
    setView("closed");
    if (showingSuccess) {
      const reset = new FormData();
      reset.set("__reset", "1");
      startTransition(() => formAction(reset));
    }
    triggerRef.current?.focus();
  }

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (submissionLocked.current || pending) {
      event.preventDefault();
      return;
    }
    submissionLocked.current = true;
  }

  const sentWithoutSession = state.status === "sent_without_session";

  return (
    <aside aria-label="Private messaging" className="message-widget">
      {view !== "closed" ? (
        <section aria-label="Message Me" aria-modal="false" className="message-widget-panel" id="message-widget-panel" role="dialog">
          <header className="message-widget-header">
            <span>MESSAGE ME</span>
            <button aria-label="Close message form" className="message-widget-close" disabled={pending} onClick={closePanel} type="button"><X aria-hidden="true" size={18} /></button>
          </header>
          {showingSuccess ? (
            <div aria-live="polite" className="message-widget-success">
              <span aria-hidden="true" className="message-widget-check">✓</span>
              <h2 ref={successRef} tabIndex={-1}>Message sent.</h2>
              <p>{sentWithoutSession ? state.error : "I'll notify you by email when I reply."}</p>
              {sentWithoutSession ? <Link className="message-widget-primary" href="/messages/recover">Find my conversation <ArrowUpRight aria-hidden="true" size={16} /></Link> : <Link className="message-widget-primary" href="/messages">View conversation <ArrowUpRight aria-hidden="true" size={16} /></Link>}
              <button className="message-widget-secondary" onClick={closePanel} type="button">Close</button>
            </div>
          ) : (
            <form action={formAction} aria-describedby={state.status === "error" ? "message-widget-error" : undefined} className="message-widget-form" onSubmit={onSubmit}>
              <input name="submissionKey" type="hidden" value={submissionKey} />
              <label>Name<input autoComplete="name" maxLength={120} name="name" ref={firstInputRef} required type="text" /></label>
              <label>Email<input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
              <label>Subject<input maxLength={200} name="subject" required type="text" /></label>
              <label>Message<textarea maxLength={5000} name="message" required rows={4} /></label>
              {state.status === "error" ? <p aria-live="polite" className="message-widget-error" id="message-widget-error" role="alert">{state.error}</p> : null}
              <button className="message-widget-primary" disabled={pending || !submissionKey} type="submit">{pending ? "Sending..." : "Send message"}<ArrowUpRight aria-hidden="true" size={16} /></button>
            </form>
          )}
        </section>
      ) : null}
      <div className="message-widget-entry">
        {view === "closed" ? <button aria-hidden={!invitationVisible} className={`message-widget-invite ${invitationVisible ? "is-visible" : ""}`} onClick={openPanel} onFocus={showInvitation} tabIndex={invitationVisible ? 0 : -1} type="button">Have something in mind? Message me here.</button> : null}
        <button aria-controls={view !== "closed" ? "message-widget-panel" : undefined} aria-expanded={view !== "closed"} aria-label="Message Aeron" className="message-widget-trigger" onClick={view === "closed" ? openPanel : closePanel} onFocus={showInvitation} onMouseEnter={showInvitation} ref={triggerRef} type="button"><MessageCircle aria-hidden="true" size={23} strokeWidth={1.8} /></button>
      </div>
    </aside>
  );
}
