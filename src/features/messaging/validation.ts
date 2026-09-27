export interface InquiryInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export const MESSAGE_MAX_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInquiry(formData: FormData):
  | { value: InquiryInput; error: null }
  | { value: null; error: string } {
  const fields = ["name", "email", "subject", "message"] as const;
  const values = fields.map((field) => formData.get(field));

  if (values.some((value) => typeof value !== "string")) {
    return { value: null, error: "Complete every field." };
  }

  const [name, email, subject, message] = (values as string[]).map((value) => value.trim());

  if (!name || !email || !subject || !message) {
    return { value: null, error: "Complete every field." };
  }

  if (name.length > 120 || email.length > 254 || subject.length > 200 || message.length > MESSAGE_MAX_LENGTH) {
    return { value: null, error: "One or more fields are too long." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { value: null, error: "Enter a valid email address." };
  }

  return { value: { name, email, subject, message }, error: null };
}

export function validateRecoveryEmail(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const email = value.trim();
  if (email.length < 3 || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email.toLowerCase();
}

export function validateReply(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length > 0 && body.length <= MESSAGE_MAX_LENGTH ? body : null;
}
