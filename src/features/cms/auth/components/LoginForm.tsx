"use client";

import { useActionState } from "react";
import { Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  login,
  type LoginActionState,
} from "@/features/cms/auth/actions";

const initialState: LoginActionState = {
  success: false,
  error: null,
};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form className="space-y-4 font-sans" action={formAction}>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/75" htmlFor="email">
          Email
        </label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35"
          />
          <input
            autoComplete="email"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-10 pr-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/25 focus:ring-2 focus:ring-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/75" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35"
          />
          <input
            autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-10 pr-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/25 focus:ring-2 focus:ring-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
      </div>

      {state.error ? (
        <p className="text-sm text-red-300" aria-live="polite" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button
        className="mt-1 h-10 w-full bg-white text-[#151922] shadow-sm hover:bg-white/90"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
