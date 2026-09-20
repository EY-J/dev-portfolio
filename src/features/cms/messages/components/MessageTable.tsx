"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { updateMessageStatusAction } from "@/features/cms/messages/actions";
import type { MessageActionState } from "@/features/cms/messages/types";
import type { Message, MessageStatus } from "@/types/message";

interface MessageTableProps {
  messages: Message[];
}

const initialState: MessageActionState = {
  success: false,
  message: null,
};

function MessageStatusForm({ message }: { message: Message }) {
  const action = updateMessageStatusAction.bind(null, message.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form className="flex min-w-48 flex-col gap-2" action={formAction}>
      <label className="text-xs font-medium text-slate-600" htmlFor={`message-${message.id}-status`}>Status</label>
      <select
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        defaultValue={message.status}
        disabled={pending}
        id={`message-${message.id}-status`}
        name="status"
      >
        {(["unread", "read", "archived"] as MessageStatus[]).map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <Button disabled={pending} type="submit">
        {pending ? "Saving..." : "Update"}
      </Button>
      {state.message ? (
        <p className={state.success ? "text-xs text-emerald-700" : "text-xs text-red-600"} aria-live="polite" role={state.success ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export default function MessageTable({ messages }: MessageTableProps) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-600">No messages found.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-4xl border-collapse text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
        <tr>
          <th className="px-4 py-3 font-medium" scope="col">From</th>
          <th className="px-4 py-3 font-medium" scope="col">Message</th>
          <th className="px-4 py-3 font-medium" scope="col">Received</th>
          <th className="px-4 py-3 font-medium" scope="col">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {messages.map((message) => (
          <tr key={message.id}>
            <td className="px-4 py-4 align-top">
              <p className="font-medium">{message.name}</p>
              <a className="text-slate-600 underline underline-offset-4" href={`mailto:${message.email}`}>{message.email}</a>
            </td>
            <td className="max-w-md px-4 py-4 align-top leading-6 text-slate-700">{message.message}</td>
            <td className="whitespace-nowrap px-4 py-4 align-top text-slate-600">{message.createdAt.toLocaleDateString()}</td>
            <td className="px-4 py-4 align-top">
              <MessageStatusForm message={message} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
