import MessageTable from "@/features/cms/messages/components/MessageTable";
import { getMessages } from "@/features/cms/messages/service";

export default async function MessagesPage() {
  const messages = await getMessages();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review messages submitted through your contact form.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Inbox</h2>
        <MessageTable messages={messages} />
      </section>
    </main>
  );
}
