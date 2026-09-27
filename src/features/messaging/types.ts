export type ConversationStatus =
  | "new"
  | "awaiting_admin"
  | "awaiting_visitor"
  | "closed";

export type SenderType = "visitor" | "admin";

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderType: SenderType;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface Conversation {
  id: string;
  realtimeTopicId: string;
  visitorName: string;
  visitorEmail: string;
  subject: string;
  status: ConversationStatus;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

export interface CreatedConversation {
  conversationId: string;
  subject: string;
  token: string;
}
