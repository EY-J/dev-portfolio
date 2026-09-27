import "server-only";

import { Resend } from "resend";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export async function sendTransactionalEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("email_not_configured");

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
  }, { idempotencyKey: payload.idempotencyKey });
  if (error) throw new Error(`email_provider_${error.name}`);
}
