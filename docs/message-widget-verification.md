# Floating Message Me verification

Use a deployed test environment with the visitor-session migration applied, working Supabase and Resend configuration, a disposable visitor mailbox, and an authorized admin account. Complete these steps in order. Use a fresh browser profile for the first pass.

1. Open `/` and confirm the small circular message trigger appears at the lower right without covering essential content.
2. Confirm the invitation beside the icon says “Have something in mind? Message me here.” on initial load.
3. Wait about five seconds without interacting and confirm the invitation hides while the trigger remains.
4. Hover the trigger, then focus it using the keyboard; confirm the invitation reappears.
5. Activate the trigger and confirm the compact panel opens without changing `/`. Its header should say only “MESSAGE ME”; the invitation sentence should not repeat inside.
6. Confirm Name, Email, Subject, and Message are the only visible inquiry fields, with labels.
7. Try an invalid submission and confirm the browser or server reports a safe validation error without discarding entered values.
8. Enter a valid disposable inquiry and rapidly activate Send message twice. Confirm only one conversation is saved.
9. While sending, confirm the button reads “Sending...” and cannot be activated again.
10. Confirm the URL remains `/` and the panel changes to “Message sent.”
11. Confirm the initial confirmation email arrives with a private link; if owner mail is configured, confirm its notification too.
12. Select View conversation and confirm the final URL is `/messages` and the new thread is visible.
13. Inspect the `portfolio_message_session` cookie: HttpOnly, SameSite=Lax, Path=/messages, Secure on HTTPS, with no raw token accessible to JavaScript or localStorage.
14. Send a visitor reply from `/messages` and confirm it appears in the same thread.
15. Reply as an authorized admin and confirm the visitor sees the reply through Realtime or Refresh messages; check the email notification.
16. Open the confirmation email's private link. Confirm it visits `/messages/[token]` only for bootstrap and ends at `/messages` with the conversation visible.
17. Request recovery from `/messages/recover`, open its email link, and confirm the same token-free final URL.
18. Return to `/`, reopen the widget, and confirm it offers a fresh inquiry form with no old private thread content.
19. Submit a second legitimate inquiry. Confirm it opens in `/messages`. Then open the first inquiry's private email link to join that older thread to the current browser session.
20. Resize to a narrow mobile viewport. Confirm the panel fits with side margins, scrolls when the keyboard opens, and the trigger remains usable.
21. Use keyboard only: focus invitation/trigger, open, move through all fields and controls, press Escape, and confirm focus returns to the trigger.
22. Repeat with reduced motion enabled and confirm no attention animation or excessive movement occurs.
23. Close the success panel, stay on `/`, reopen, and confirm the old message cannot be resubmitted by accident.
24. Select Forget this device from `/messages` and confirm the thread is no longer available from that browser until a valid private email/recovery link is opened.

Also check the fallback path in a disposable environment: if visitor-session creation fails after a saved inquiry, the widget should report that the message was saved and offer recovery, without showing View conversation or any raw token. Restore the session service afterward.
