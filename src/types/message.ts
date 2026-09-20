export type MessageStatus = "unread" | "read" | "archived";

export interface Message {
  id: string;
  name: string;
  email: string;
  message: string;
  status: MessageStatus;
  createdAt: Date;
}
