import type { MessageStatus } from "@/types/message";

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  message: string;
  status: MessageStatus;
  created_at: string;
}

export interface MessageActionState {
  success: boolean;
  message: string | null;
}
