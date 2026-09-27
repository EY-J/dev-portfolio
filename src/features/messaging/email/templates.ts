import "server-only";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function safeHeader(value: string) {
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
}

function emailBody(greeting: string, lines: string[], buttonLabel: string, url: string) {
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><p>${escapeHtml(greeting)}</p>${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(buttonLabel)}</a></p><p style="font-size:13px;color:#475569">If the button does not work, use this link:<br><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p></body></html>`;
  const text = `${greeting}\n\n${lines.join("\n\n")}\n\n${buttonLabel}: ${url}`;
  return { html, text };
}

export function conversationCreatedEmail(name: string, subject: string, url: string) {
  return {
    subject: safeHeader(`We received your message — ${subject}`),
    ...emailBody(`Hi ${name},`, ["Your message has been received.", `A private conversation has been created for your inquiry: ${subject}`, "You do not need an account. Keep this link private because it provides access to your conversation.", "Please continue the conversation through your private conversation page."], "Open Conversation", url),
  };
}

export function adminReplyEmail(name: string, subject: string, url: string) {
  return {
    subject: safeHeader(`New reply to your inquiry — ${subject}`),
    ...emailBody(`Hi ${name},`, [`You have a new reply regarding: ${subject}`, "Please continue the conversation through your private conversation page."], "View Conversation", url),
  };
}

export function ownerVisitorMessageEmail(name: string, subject: string, url: string, initial: boolean) {
  return {
    subject: safeHeader(initial ? `New portfolio inquiry from ${name}` : `New visitor reply — ${subject}`),
    ...emailBody("Hello,", [initial ? `${name} sent a new inquiry: ${subject}` : `${name} replied to: ${subject}`, "Open the CMS inbox to read and reply."], "Open Admin Inbox", url),
  };
}

export interface RecoveryEmailItem {
  subject: string;
  createdAt: Date;
  closed: boolean;
  url: string;
}

export function conversationRecoveryEmail(name: string, items: RecoveryEmailItem[]) {
  const subject = items.length === 1 ? "Your private portfolio conversation link" : "Your private portfolio conversation links";
  const intro = "You requested access to your private portfolio conversation. Keep these links private because they provide access to your conversation.";
  const footer = "If you did not request this email, you can ignore it. Please continue conversations through the private portfolio page.";
  const htmlItems = items.map((item) => {
    const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(item.createdAt);
    return `<li style="margin:0 0 20px"><strong>${escapeHtml(item.subject)}</strong><br><span>Started ${escapeHtml(date)}${item.closed ? " · Closed" : ""}</span><br><a href="${escapeHtml(item.url)}">Continue Conversation</a></li>`;
  }).join("");
  const textItems = items.map((item) => {
    const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(item.createdAt);
    return `${item.subject}\nStarted ${date}${item.closed ? " · Closed" : ""}\nContinue Conversation: ${item.url}`;
  }).join("\n\n");
  return {
    subject,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1e293b;line-height:1.6"><p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(intro)}</p><ul style="padding-left:20px">${htmlItems}</ul><p>${escapeHtml(footer)}</p></body></html>`,
    text: `Hi ${name},\n\n${intro}\n\n${textItems}\n\n${footer}`,
  };
}
