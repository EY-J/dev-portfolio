import MessageCenter from "@/features/cms/messages/components/MessageCenter";
import { getAdminConversations } from "@/features/messaging/service";

export const fetchCache = "force-no-store";

export default async function MessagesPage() {
  const conversations = await getAdminConversations();

  return (
    <main className="mx-auto max-w-7xl">
      <MessageCenter conversations={conversations} />
    </main>
  );
}
